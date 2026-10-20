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
        state = dict(role=role, topics=copy.deepcopy(seed), otp=[], fail=False)
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
                                for t in state['topics'] if t['status'] != 'pending' or state['role']]
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
                t.update(data)
                response = dict(id=topic_id)
            elif endpoint.endswith('/auth/v1/otp'):
                state['otp'].append(dict(data=data, query=parse_qs(parsed.query)))
                response = {}
            elif endpoint.endswith('/auth/v1/user'):
                response = state.get('user', {})
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
    expect(page.get_by_role('link', name='View meeting: November 20, 2026 →')).to_have_attribute('href', '/meetings/2026-11-20-wip-2/')
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
    editor = page.locator('.admin-topic-card').filter(has=page.get_by_role('heading', name='A clarified research question', exact=True))
    editor.locator('select[name="status"]').select_option('scheduled')
    expect(editor.locator('select[name="scheduled_meeting_id"]')).to_be_enabled()
    editor.locator('select[name="scheduled_meeting_id"]').select_option('2026-11-20-wip-2')
    editor.get_by_role('button', name='Save topic', exact=True).click()
    expect(editor.locator('.topic-status')).to_have_text('Scheduled')
    assert state['topics'][4]['scheduled_meeting_id'] == '2026-11-20-wip-2'
    page.screenshot(path='/tmp/edm-topics-admin.png', full_page=True)
    editor.locator('select[name="status"]').select_option('archived')
    editor.get_by_role('button', name='Save topic', exact=True).click()
    expect(page.locator('.admin-topic-card').filter(has=page.get_by_role('heading', name='A clarified research question', exact=True))).to_have_count(0)
    page.locator('[data-admin-topic-filter]').select_option('archived')
    expect(page.locator('.admin-topic-card')).to_have_count(1)
    assert not errors, errors
    context.close()
    browser.close()
print('Topics browser tests passed: sign-in return flow, shared article session, suggest/review, vote/unvote, filters, meeting links, privacy on sign-out, errors/retry, and mobile layout.')
