export type FeedbackTone = "success" | "error" | "info";

let feedbackTimer: number | undefined;

export function showActionFeedback(message: string, tone: FeedbackTone = "success") {
  const feedback = document.querySelector<HTMLElement>("[data-action-feedback]");
  if (!feedback) return;

  if (feedbackTimer) window.clearTimeout(feedbackTimer);
  feedback.dataset.tone = tone;
  feedback.textContent = message;

  feedbackTimer = window.setTimeout(() => {
    feedback.textContent = "";
    delete feedback.dataset.tone;
  }, 6000);
}
