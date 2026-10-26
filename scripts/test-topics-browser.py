#!/usr/bin/env python3
"""Browser regression checks against a local site, with every Supabase call mocked.

Requires Python Playwright and Chromium. No emails or live database writes occur.
Run the dev server with its normal public Supabase configuration first.
"""
import base64
import copy
import json
import os
from pathlib import Path
import time
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parent.parent
site_url = os.environ.get('TOPICS_TEST_URL', 'http://127.0.0.1:4325')
config = dict(os.environ)
if (root / '.env').exists():
    for line in (root / '.env').read_text().splitlines():
        if line.startswith('PUBLIC_') and '=' in line:
            key, value = line.split('=', 1)
            config.setdefault(key, value.strip().strip('"\''))
api_url = config.get('PUBLIC_SUPABASE_URL', '').rstrip('/')
if not api_url:
    raise SystemExit('Configure PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY for the local preview before testing.')

alpha = '00000000-0000-0000-0000-000000000001'
admin = '00000000-0000-0000-0000-000000000004'

def topic(number, title, status='open', interests=0, owner=False, meeting=None):
    return dict(id=f'10000000-0000-0000-0000-{number:012d}', title=title, description='A question for colleagues across labs.', status=status,
                interests=interests, is_owner=owner, is_interested=False, scheduled_meeting_id=meeting, created_at=f'2026-10-{10+number:02d}T12:00:00Z')

seed = [topic(1, 'How reliable are computational parameters?', interests=4), topic(2, 'Comparing approaches across labs', interests=1),
        topic(3, 'Clinical translation in decision neuroscience', 'planning', interests=2),
        topic(4, 'A scheduled topic', 'scheduled', interests=2, meeting='2026-11-20-wip-2'),
        topic(5, 'My pending question', 'pending', owner=True)]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, channel=os.environ.get('TOPICS_TEST_BROWSER_CHANNEL'))

    def setup(role=None, viewport=None):
        state = dict(role=role, topics=copy.deepcopy(seed), otp=[], fail=False, patch_fail=False)
        context = browser.new_context(viewport=viewport or dict(width=1440, height=1100))
        if role:
            user_id, email = (admin, 'coordinator@emory.edu') if role == 'admin' else (alpha, 'alpha@emory.edu')
            user = dict(id=user_id, email=email, aud='authenticated', role='authenticated', app_metadata=dict(provider='email', providers=['email']), user_metadata={}, created_at='2026-10-01T12:00:00Z')
            encode = lambda obj: base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')
            token = encode(dict(alg='HS256', typ='JWT')) + '.' + encode(dict(sub=user_id, exp=int(time.time())+7200, email=email, role='authenticated')) + '.test'
            session = dict(access_token=token, refresh_token='test-refresh-token', expires_at=int(time.time())+7200, expires_in=7200, token_type='bearer', user=user)
            storage_key = 'sb-' + urlparse(api_url).hostname.split('.')[0] + '-auth-token'
            context.add_init_script('localStorage.setItem(' + json.dumps(storage_key) + ', ' + json.dumps(json.dumps(session)) + ');')
            state['user'] = user
            state['session'] = session

        def api(route):
            request = route.request
            parsed = urlparse(request.url)
            endpoint = parsed.path
            data = request.post_data_json if request.method in ('POST', 'PATCH') and request.post_data else {}
            status_code, response = 200, []
            if request.method == 'OPTIONS':
                response = {}
            elif endpoint.endswith('/rpc/get_topics'):
                if state['fail']:
                    status_code, response = 500, dict(message='Simulated unavailable database')
                else:
                    response = [dict(t, is_owner=t['is_owner'] if state['role'] else False, is_interested=t['is_interested'] if state['role'] else False)
                                for t in state['topics'] if t['status'] in ('open', 'planning', 'scheduled', 'discussed') or state['role'] == 'admin' or (state['role'] and t['is_owner'] and t['status'] == 'pending')]
            elif endpoint.endswith('/rpc/is_current_user_admin'):
                response = state['role'] == 'admin'
            elif endpoint.endswith('/topic_votes'):
                if request.method == 'POST':
                    t = next(t for t in state['topics'] if t['id'] == data['topic_id'])
                    assert not t['is_interested'], 'duplicate browser vote'
                    t['is_interested'] = True
                    t['interests'] += 1
                elif request.method == 'DELETE':
                    topic_id = parse_qs(parsed.query)['topic_id'][0].removeprefix('eq.')
                    t = next(t for t in state['topics'] if t['id'] == topic_id)
                    t['is_interested'] = False
                    t['interests'] -= 1
                status_code, response = 201 if request.method == 'POST' else 200, None
            elif endpoint.endswith('/topics') and request.method == 'POST':
                t = topic(6, data['title'], 'pending', owner=True)
                t['description'] = data['description']
                state['topics'].append(t)
                status_code, response = 201, None
            elif endpoint.endswith('/topics') and request.method == 'PATCH':
                topic_id = parse_qs(parsed.query)['id'][0].removeprefix('eq.')
                t = next(t for t in state['topics'] if t['id'] == topic_id)
                if state['patch_fail']:
                    status_code, response = 500, dict(message='Simulated save failure')
                else:
                    t.update(data)
                    response = dict(id=topic_id)
            elif endpoint.endswith('/auth/v1/otp'):
                state['otp'].append(dict(data=data, query=parse_qs(parsed.query)))
                response = {}
            elif endpoint.endswith('/auth/v1/user'):
                response = state.get('user', {})
            elif endpoint.endswith('/auth/v1/token'):
                response = state['session']
            elif endpoint.endswith('/auth/v1/logout'):
                state['role'] = None
                response = {}
            elif endpoint.startswith('/rest/v1/'):
                response = []
            else:
                raise AssertionError('Unexpected mocked API request: ' + endpoint)
            route.fulfill(status=status_code, content_type='application/json', body=json.dumps(response), headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
        context.route(api_url + '/**', api)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        return context, page, state, errors

    context, page, state, errors = setup()
    page.goto(site_url + '/topics/')
    expect(page.locator('.topic-card')).to_have_count(3)
    expect(page.locator('.desktop-nav a[aria-current="page"]')).to_have_text('Topics')
    page.get_by_role('button', name='Show interest in How reliable are computational parameters?', exact=True).click()
    expect(page.locator('[data-member-panel]')).to_have_attribute('open', '')
    expect(page.locator('#member-email')).to_be_focused()
    page.locator('#member-email').fill('someone@example.com')
    page.get_by_role('button', name='Email me a link', exact=True).click()
    expect(page.locator('[data-auth-status]')).to_contain_text('@emory.edu')
    assert not state['otp']
    page.locator('#member-email').fill('alpha@emory.edu')
    page.get_by_role('button', name='Email me a link', exact=True).click()
    expect(page.locator('[data-auth-status]')).to_contain_text('Check your Emory email')
    assert state['otp'][0]['data']['email'] == 'alpha@emory.edu'
    redirect = state['otp'][0]['query']['redirect_to'][0]
    assert 'action=vote' in redirect and 'topic=' in redirect
    page.locator('[data-topic-filter]').select_option('pending')
    expect(page.locator('[data-topic-list]')).to_contain_text('Sign in')
    page.locator('[data-topic-filter]').select_option('scheduled')
    expect(page.get_by_role('link', name='View meeting: November 20, 2026 →')).to_have_attribute('href', '/meetings/2026-11-20/')
    assert not errors, errors
    context.close()

    context, page, state, errors = setup('member')
    page.goto(site_url + '/topics/?action=suggest')
    expect(page.locator('[data-topic-drawer]')).to_be_visible()
    expect(page.locator('[data-topic-form] input[name="title"]')).to_be_focused()
    assert 'action=' not in page.url
    page.locator('[data-close-topic]').click()
    card = page.locator('#topic-' + seed[0]['id'])
    card.get_by_role('button').click()
    expect(card.get_by_role('button')).to_have_attribute('aria-pressed', 'true')
    expect(card).to_contain_text('5 people interested')
    card.get_by_role('button').click()
    expect(card).to_contain_text('4 people interested')
    page.locator('[data-topic-sort]').select_option('newest')
    expect(page.locator('.topic-card h2').first).to_have_text(seed[2]['title'])
    page.locator('[data-topic-filter]').select_option('mine')
    expect(page.locator('[data-topic-list]')).to_contain_text('Choose “I’m interested”')
    page.locator('[data-open-topic]').click()
    page.locator('[data-topic-form] input[name="title"]').fill('How do we compare learning models?')
    page.locator('[data-topic-form] textarea').fill('<img src=x onerror=alert(1)> Plain text only.')
    page.get_by_role('button', name='Send for review', exact=True).click()
    expect(page.locator('[data-topic-filter]')).to_have_value('pending')
    expect(page.locator('.topic-card')).to_have_count(2)
    expect(page.locator('[data-topic-list]')).to_contain_text('How do we compare learning models?')
    assert page.locator('[data-topic-list] img').count() == 0
    page.locator('[data-topic-filter]').select_option('active')
    page.locator('[data-topic-sort]').select_option('interest')
    page.goto(site_url + '/topics/')
    expect(page.locator('.topic-card')).to_have_count(3)
    page.screenshot(path='/tmp/edm-topics-desktop.png', full_page=True, animations='disabled')
    page.set_viewport_size(dict(width=390, height=844))
    page.reload()
    expect(page.locator('.topic-card')).to_have_count(3)
    page.screenshot(path='/tmp/edm-topics-mobile.png', full_page=True, animations='disabled')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'mobile horizontal overflow'
    page.locator('[data-topic-filter]').select_option('pending')
    page.locator('[data-member-panel] summary').click()
    page.locator('[data-sign-out]').click()
    expect(page.locator('[data-topic-list]')).to_contain_text('Sign in')
    expect(page.locator('[data-topic-list]')).not_to_contain_text('My pending question')
    expect(page.locator('[data-member-panel]')).not_to_have_attribute('open', '')
    expect(page.locator('[data-member-panel] summary')).to_be_focused()
    page.locator('[data-member-panel] summary').click()
    # On mobile the expanded panel must push board controls down, not cover them.
    panel_box = page.locator('.member-access-panel').bounding_box()
    refresh_box = page.locator('[data-refresh-topics]').bounding_box()
    assert panel_box['y'] + panel_box['height'] <= refresh_box['y'], 'sign-in panel covers board controls'
    page.locator('#member-email').focus()
    page.keyboard.press('Escape')
    expect(page.locator('[data-member-panel]')).not_to_have_attribute('open', '')
    page.locator('[data-member-panel] summary').click()
    page.get_by_role('heading', name='Meeting topics', exact=True).click()
    expect(page.locator('[data-member-panel]')).not_to_have_attribute('open', '')
    state['fail'] = True
    page.locator('[data-refresh-topics]').click()
    expect(page.locator('[data-topics-status]')).to_contain_text('could not be loaded')
    expect(page.locator('[data-topic-list]')).to_have_attribute('aria-busy', 'false')
    state['fail'] = False
    page.locator('[data-refresh-topics]').click()
    expect(page.locator('[data-topics-status]')).to_contain_text('community topics')
    assert not errors, errors
    context.close()

    context, page, state, errors = setup('member')
    page.goto(site_url + '/articles/')
    expect(page.locator('[data-member-label]')).to_have_text('Account')
    page.locator('[data-member-panel] summary').click()
    expect(page.locator('[data-member-email]')).to_have_text('alpha@emory.edu')
    assert not errors, errors
    context.close()

    context, page, state, errors = setup('admin')
    page.goto(site_url + '/admin/')
    expect(page.locator('[data-admin-workspace]')).to_be_visible()
    expect(page.locator('[data-admin-topics] .admin-topic-card')).to_have_count(1)
    editor = page.locator('[data-admin-topics] .admin-topic-card').first
    editor.locator('input[name="title"]').fill('A clarified research question')
    editor.get_by_role('button', name='Approve for interest', exact=True).click()
    expect(page.locator('[data-topic-review-count]')).to_have_text('0')
    assert state['topics'][4]['status'] == 'open'
    page.locator('[data-admin-topic-filter]').select_option('active')
    expect(page.locator('.admin-topic-card h3').first).to_have_text(seed[0]['title'])
    other = page.locator(f'[data-topic-id="{seed[0]["id"]}"]')
    other.locator('input[name="title"]').fill('Unsaved edits to another topic')
    other.locator('textarea').fill('Keep this context while reviewing other topics.')
    other.locator('select[name="status"]').select_option('planning')
    expect(page.locator('[data-topic-draft-count]')).to_contain_text('1 topic has unsaved changes')
    page.locator('[data-admin-topic-sort]').select_option('newest')
    expect(page.locator('.admin-topic-card h3').first).to_have_text('A clarified research question')
    page.locator('[data-admin-topic-filter]').select_option('planning')
    expect(page.locator('.admin-topic-card')).to_have_count(1)
    page.locator('[data-admin-topic-filter]').select_option('active')
    page.locator('[data-admin-topics-refresh]').click()
    expect(page.locator('[data-admin-topics]')).to_have_attribute('aria-busy', 'false')
    expect(other.locator('input[name="title"]')).to_have_value('Unsaved edits to another topic')
    expect(other.locator('textarea')).to_have_value('Keep this context while reviewing other topics.')
    expect(other.locator('select[name="status"]')).to_have_value('planning')
    # Refreshing the real Supabase client session must not clear this account's drafts.
    other.locator('input[name="title"]').focus()
    page.evaluate("""async () => {
      const { supabase } = await import('/src/lib/supabase.ts');
      const { error } = await supabase.auth.refreshSession();
      if (error) throw error;
    }""")
    expect(page.locator('[data-admin-workspace]')).to_be_visible()
    expect(other.locator('input[name="title"]')).to_have_value('Unsaved edits to another topic')
    expect(other.locator('input[name="title"]')).to_be_focused()
    state['fail'] = True
    page.locator('[data-admin-topics-refresh]').click()
    expect(page.locator('[data-admin-topics-status]')).to_contain_text('could not be refreshed')
    expect(other.locator('input[name="title"]')).to_have_value('Unsaved edits to another topic')
    state['fail'] = False
    page.locator('[data-admin-topics-refresh]').click()
    expect(page.locator('[data-admin-topics-status]')).to_be_empty()
    editor = page.locator('.admin-topic-card').filter(has=page.get_by_role('heading', name='A clarified research question', exact=True))
    editor.locator('select[name="status"]').select_option('scheduled')
    expect(editor.locator('select[name="scheduled_meeting_id"]')).to_be_enabled()
    editor.locator('select[name="scheduled_meeting_id"]').select_option('2026-11-20-wip-2')
    expect(editor.get_by_role('link', name='View published meeting →')).to_have_attribute('href', '/meetings/2026-11-20/')
    editor.get_by_role('button', name='Save topic', exact=True).click()
    expect(editor.locator('.topic-status')).to_have_text('Scheduled')
    assert state['topics'][4]['scheduled_meeting_id'] == '2026-11-20-wip-2'
    expect(other.locator('input[name="title"]')).to_have_value('Unsaved edits to another topic')
    expect(other.locator('textarea')).to_have_value('Keep this context while reviewing other topics.')
    expect(other.locator('select[name="status"]')).to_have_value('planning')
    state['patch_fail'] = True
    other.get_by_role('button', name='Save topic', exact=True).click()
    expect(other.locator('.form-status')).to_contain_text('couldn’t save')
    expect(other.locator('input[name="title"]')).to_have_value('Unsaved edits to another topic')
    expect(other.get_by_role('button', name='Save topic', exact=True)).to_be_enabled()
    state['patch_fail'] = False
    other.get_by_role('button', name='Discard changes', exact=True).click()
    expect(other.locator('input[name="title"]')).to_have_value(seed[0]['title'])
    expect(page.locator('[data-topic-draft-count]')).to_be_hidden()
    page.locator('[data-admin-topic-filter]').select_option('scheduled')
    expect(page.locator('.admin-topic-card')).to_have_count(2)
    page.locator('[data-admin-topic-filter]').select_option('discussed')
    expect(page.locator('.admin-topic-card')).to_have_count(0)
    page.locator('[data-admin-topic-filter]').select_option('open')
    expect(page.locator('.admin-topic-card')).to_have_count(2)
    page.locator('[data-admin-topic-filter]').select_option('active')
    page.locator('[data-admin-topic-sort]').select_option('interest')
    page.screenshot(path='/tmp/edm-topics-admin.png', full_page=True)
    page.set_viewport_size(dict(width=390, height=844))
    page.locator('[data-admin-topic-filter]').scroll_into_view_if_needed()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'coordinator mobile overflow'
    page.screenshot(path='/tmp/edm-topics-admin-mobile.png', full_page=False)
    page.set_viewport_size(dict(width=1440, height=1100))
    editor.locator('select[name="status"]').select_option('archived')
    editor.get_by_role('button', name='Save topic', exact=True).click()
    expect(page.locator('.admin-topic-card').filter(has=page.get_by_role('heading', name='A clarified research question', exact=True))).to_have_count(0)
    page.locator('[data-admin-topic-filter]').select_option('archived')
    expect(page.locator('.admin-topic-card')).to_have_count(1)
    editor.locator('select[name="status"]').select_option('open')
    editor.get_by_role('button', name='Save topic', exact=True).click()
    expect(page.locator('.admin-topic-card')).to_have_count(0)
    assert state['topics'][4]['status'] == 'open' and state['topics'][4]['scheduled_meeting_id'] is None
    page.locator('[data-admin-topic-filter]').select_option('active')
    other.locator('input[name="title"]').fill('An account-specific unsaved draft')
    # Exercise the actual navigation warning, then keep the editor open.
    dialogs = []
    def keep_draft(dialog):
        dialogs.append(dialog.type)
        dialog.dismiss()
    page.once('dialog', keep_draft)
    try:
        page.goto(site_url + '/topics/')
    except Exception as error:
        assert 'ERR_ABORTED' in str(error), error
    assert dialogs == ['beforeunload'], dialogs
    expect(other.locator('input[name="title"]')).to_have_value('An account-specific unsaved draft')
    page.locator('[data-admin-sign-out]').click()
    expect(page.locator('[data-admin-workspace]')).to_be_hidden()
    expect(page.locator('[data-admin-topics]')).to_be_empty()
    expect(page.locator('[data-topic-draft-count]')).to_be_hidden()
    assert not errors, errors
    context.close()

    context, page, state, errors = setup('admin', dict(width=390, height=844))
    meeting_id = '2026-11-20-wip-2'
    state['topics'] += [topic(6, 'Discussed linked question', 'discussed', meeting=meeting_id),
                        topic(7, 'Private archived topic', 'archived', meeting=meeting_id)]
    # Deliberately include malformed private data in the mock to check the UI's public-status guard.
    state['topics'][4]['scheduled_meeting_id'] = meeting_id
    state['fail'] = True
    page.goto(site_url + '/meetings/2026-11-20/')
    expect(page.locator('[data-meeting-topics-status]')).to_contain_text('could not be loaded')
    state['fail'] = False
    page.get_by_role('button', name='Retry loading topics').click()
    expect(page.locator('.meeting-topic-card')).to_have_count(2)
    expect(page.locator('[data-meeting-topics]')).not_to_contain_text('Private archived topic')
    expect(page.locator('[data-meeting-topics]')).not_to_contain_text('My pending question')
    expect(page.locator('[data-meeting-topics-status]')).to_be_hidden()
    page.screenshot(path='/tmp/edm-meeting-topics-mobile.png', full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'meeting topics mobile overflow'
    page.get_by_role('link', name='A scheduled topic', exact=True).click()
    expect(page.locator('[data-topic-filter]')).to_have_value('all')
    expect(page.get_by_role('heading', name='A scheduled topic', exact=True)).to_be_focused()
    page.goto(site_url + '/meetings/2026-11-06/')
    expect(page.locator('[data-meeting-topics]')).to_be_hidden()
    assert not errors, errors
    context.close()

    context, page, state, errors = setup()
    page.goto(site_url + '/topics/?topic=' + seed[3]['id'])
    expect(page.locator('[data-topic-filter]')).to_have_value('all')
    expect(page.get_by_role('heading', name='A scheduled topic', exact=True)).to_be_focused()
    assert not state['otp'] and not errors, (state['otp'], errors)
    context.close()
    browser.close()
print('Topics browser tests passed: sign-in, suggestions, vote/unvote, coordinator sorting and status filters, draft preservation/discard/navigation warnings, save and refresh recovery, moderation and restoration, reciprocal meeting links, privacy on sign-out, and mobile layout.')
