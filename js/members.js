/* =========================================================
   SAVE MEMBER
   ========================================================= */

async function saveMember(event) {
  event?.preventDefault();

  clearError();
  clearFormMessage();

  const values =
    getFormValues();

  const validation =
    validateForm(
      values
    );

  if (validation !== true) {
    showFormMessage(
      validation,
      "error"
    );

    return;
  }


  try {

    const duplicate =
      await checkDuplicateMemberNumber(
        values.member_number
      );

    if (duplicate) {
      showFormMessage(
        "That member number is already in use in this group.",
        "error"
      );

      return;
    }


    /* =====================================================
       EXISTING MEMBER
       ===================================================== */

    if (editingMemberId) {

      /*
       * Profile-only update.
       *
       * No contribution tables are directly changed.
       *
       * No new-member historical RPC is called.
       */

      const {
        error
      } = await supabase
        .from("members")
        .update({
          member_number:
            values.member_number,

          name:
            values.name,

          national_id:
            values.national_id,

          phone:
            values.phone,

          email:
            values.email ||
            null,

          role:
            values.role,

          status:
            values.status,

          join_date:
            values.join_date ||
            null
        })
        .eq(
          "id",
          editingMemberId
        )
        .eq(
          "group_id",
          groupId
        );

      if (error) {
        throw error;
      }


      await loadMembers();

      await loadMemberContributionPositions();

      renderMembers();

      updateMemberCount();

      showStatus(
        "Member details updated. No historical accounting entries were changed."
      );

      closeAddMember();

      return;
    }


    /* =====================================================
       NEW MEMBER
       CANONICAL ACCOUNTING FLOW
       ===================================================== */

    let result =
      null;


    /* -----------------------------------------------------
       NEW MEMBER WITH HISTORICAL CONTRIBUTIONS
       ----------------------------------------------------- */

    if (
      values.historical_enabled
    ) {

      /*
       * IMPORTANT:
       *
       * This RPC creates the NEW MEMBER and its canonical
       * historical accounting.
       *
       * Frontend does not insert:
       *
       *   contributions
       *   contribution_allocations
       *   contribution_obligations
       *
       * The parameter names below MUST match the deployed
       * canonical RPC contract:
       *
       *   p_member
       *   p_contribution_plan
       *   p_historical
       *   p_request_id
       */

      const {
        data,
        error
      } = await supabase.rpc(
        "create_member_with_historical_contributions",
        {
          p_member: {
            group_id:
              groupId,

            member_number:
              values.member_number,

            name:
              values.name,

            national_id:
              values.national_id,

            phone:
              values.phone,

            email:
              values.email ||
              null,

            role:
              values.role,

            status:
              values.status,

            join_date:
              values.join_date
          },

          /*
           * CORRECTED RPC PARAMETER
           *
           * Previously:
           *   p_contribution_rule
           *
           * Deployed RPC expects:
           *   p_contribution_plan
           */
          p_contribution_plan: {
            contribution_type_id:
              monthlyContributionType?.id ||
              null,

            amount:
              values.contribution_amount,

            first_period_rule:
              values.first_period_rule,

            effective_from:
              values.contribution_effective_from
          },

          p_historical: {
            enabled:
              true,

            paid_through:
              values.historical_paid_through,

            payment_method:
              values.historical_payment_method
          },

          /*
           * CORRECTED RPC PARAMETER
           *
           * Previously:
           *   p_idempotency_key
           *
           * Deployed RPC expects:
           *   p_request_id
           */
          p_request_id:
            crypto.randomUUID()
        }
      );

      if (error) {
        throw error;
      }

      result =
        Array.isArray(data)
          ? data[0] || data
          : data;


    } else {

      /* ---------------------------------------------------
         NEW MEMBER WITHOUT HISTORICAL CONTRIBUTIONS
         --------------------------------------------------- */

      const {
        data,
        error
      } = await supabase.rpc(
        "create_member_with_contribution_plan",
        {
          p_member: {
            group_id:
              groupId,

            member_number:
              values.member_number,

            name:
              values.name,

            national_id:
              values.national_id,

            phone:
              values.phone,

            email:
              values.email ||
              null,

            role:
              values.role,

            status:
              values.status,

            join_date:
              values.join_date
          },

          p_contribution_rule: {
            contribution_type_id:
              monthlyContributionType?.id ||
              null,

            amount:
              values.contribution_amount,

            first_period_rule:
              values.first_period_rule,

            effective_from:
              values.contribution_effective_from
          },

          p_idempotency_key:
            crypto.randomUUID()
        }
      );

      if (error) {
        throw error;
      }

      result =
        Array.isArray(data)
          ? data[0] || data
          : data;
    }


    /* =====================================================
       REFRESH ACCOUNTING STATE
       ===================================================== */

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();


    showStatus(
      contributionResultMessage(
        result
      )
    );


    closeAddMember();


    /* =====================================================
       ONBOARDING EVENT
       ===================================================== */

    try {
      const createdMemberId =
        Array.isArray(result)
          ? (
              result[0]?.member_id ||
              result[0]?.id
            )
          : (
              result?.member_id ||
              result?.id
            );

      sessionStorage.setItem(
        "chamaLiveMemberOnboardingCompleted",
        JSON.stringify({
          memberId:
            createdMemberId,

          groupId:
            groupId,

          completedAt:
            new Date().toISOString()
        })
      );

    } catch {
      /*
       * Session storage is non-critical.
       */
    }


  } catch (error) {

    console.error(
      "saveMember failed:",
      error
    );

    showFormMessage(
      error?.message ||
      "Unable to save the member.",
      "error"
    );
  }
}
