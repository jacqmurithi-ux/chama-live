/* =========================================================
   MANUAL FINE FORM LABEL / PLACEHOLDER
========================================================= */

function updateManualFineReasonField() {

  const triggerType =
    String(
      elements.manualFineTriggerType?.value ||
      ""
    ).trim().toLowerCase();

  const reasonField =
    elements.manualFineReason;

  if (!reasonField) {
    return;
  }

  const reasonLabel =
    document.querySelector(
      'label[for="manualFineReason"]'
    );

  if (
    triggerType === "custom_event"
  ) {

    if (reasonLabel) {
      reasonLabel.textContent =
        "Custom Fine Name / Description";
    }

    reasonField.placeholder =
      "Enter the custom fine name or description…";

    return;
  }

  if (reasonLabel) {
    reasonLabel.textContent =
      "Reason";
  }

  reasonField.placeholder =
    "Enter the reason for this fine…";
}
