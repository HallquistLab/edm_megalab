import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { showActionFeedback } from "./feedback";

type ProposalType = "work_in_progress" | "current_topic_or_workshop";

const form = document.querySelector<HTMLFormElement>("[data-session-proposal-form]");
const status = document.querySelector<HTMLElement>("[data-session-proposal-status]");
const sections = Array.from(
  document.querySelectorAll<HTMLElement>("[data-proposal-section]"),
);

function value(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function selectProposalType(proposalType: ProposalType) {
  sections.forEach((section) => {
    const isActive = section.dataset.proposalSection === proposalType;
    section.hidden = !isActive;
    section
      .querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input, textarea, select")
      .forEach((field) => {
        field.disabled = !isActive;
      });
  });
}

form
  ?.querySelectorAll<HTMLInputElement>('input[name="proposal_type"]')
  .forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) selectProposalType(input.value as ProposalType);
    });
  });

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !isSupabaseConfigured) {
    if (status) status.textContent = "Connect Supabase to submit session proposals.";
    showActionFeedback("Session proposals are not available in demo mode.", "info");
    return;
  }

  const data = new FormData(form);
  const proposalType = value(data, "proposal_type") as ProposalType;
  const shared = {
    proposal_type: proposalType,
    submitter_name: value(data, "submitter_name"),
    contact_email: value(data, "contact_email").toLowerCase(),
    working_title: value(data, "working_title"),
  };
  const isWip = proposalType === "work_in_progress";
  const payload = {
    ...shared,
    project_stage: isWip ? value(data, "wip_project_stage") : "",
    scientific_question: isWip ? value(data, "wip_scientific_question") : "",
    session_goals: isWip ? value(data, "wip_session_goals") : "",
    material_to_share: isWip ? value(data, "wip_material_to_share") : "",
    discussion_preference: isWip ? value(data, "wip_discussion_preference") : "",
    useful_expertise: isWip ? value(data, "wip_useful_expertise") : "",
    sharing_constraints: isWip ? value(data, "wip_sharing_constraints") : "",
    topic_summary: isWip ? "" : value(data, "topic_summary"),
    relevance: isWip ? "" : value(data, "relevance"),
    desired_outcomes: isWip ? "" : value(data, "desired_outcomes"),
    suggested_format: isWip ? "" : value(data, "suggested_format"),
    proposed_lead: isWip ? "" : value(data, "proposed_lead"),
    preparation_notes: isWip ? "" : value(data, "preparation_notes"),
  };

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
  }
  if (status) status.textContent = "Sending your proposal…";

  const { error } = await supabase.from("session_proposals").insert(payload);
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Send to coordinators";
  }
  if (error) {
    if (status) status.textContent = error.message;
    showActionFeedback("We couldn’t submit the proposal. Please try again.", "error");
    return;
  }

  form.reset();
  selectProposalType("work_in_progress");
  if (status) status.textContent = "Submitted. A coordinator will follow up by email.";
  showActionFeedback("Session proposal sent to the coordinators.");
});

selectProposalType("work_in_progress");
