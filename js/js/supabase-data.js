(function () {

  "use strict";


  /* ============================================================
     GET EXISTING SUPABASE CLIENT
     ============================================================ */

  function getSupabase() {

    const client =
      window.chamaSupabase;

    if (!client) {

      throw new Error(
        "Chama Live Supabase client is not initialized. " +
        "Make sure js/supabase-client.js loads first."
      );

    }

    return client;
  }


  /* ============================================================
     CURRENT USER
     ============================================================ */

  async function getCurrentUser() {

    const supabase =
      getSupabase();

    const {
      data,
      error
    } =
      await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    if (
      !data ||
      !data.user
    ) {

      throw new Error(
        "You are not logged in."
      );

    }

    return data.user;
  }


  /* ============================================================
     CURRENT MEMBER
     ============================================================ */

  async function getCurrentMember() {

    const supabase =
      getSupabase();

    const user =
      await getCurrentUser();


    /*
     * First try auth_user_id.
     */

    let result =
      await supabase
        .from("members")
        .select(`
          id,
          group_id,
          user_id,
          auth_user_id,
          member_number,
          membership_number,
          name,
          email,
          phone,
          role,
          status,
          onboarding_status
        `)
        .eq(
          "auth_user_id",
          user.id
        )
        .maybeSingle();


    if (result.error) {

      throw result.error;

    }


    if (result.data) {

      return result.data;

    }


    /*
     * Some older Chama Live records may
     * use user_id instead.
     */

    result =
      await supabase
        .from("members")
        .select(`
          id,
          group_id,
          user_id,
          auth_user_id,
          member_number,
          membership_number,
          name,
          email,
          phone,
          role,
          status,
          onboarding_status
        `)
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();


    if (result.error) {

      throw result.error;

    }


    if (result.data) {

      return result.data;

    }


    /*
     * Final fallback:
     * Match authenticated email.
     */

    if (user.email) {

      result =
        await supabase
          .from("members")
          .select(`
            id,
            group_id,
            user_id,
            auth_user_id,
            member_number,
            membership_number,
            name,
            email,
            phone,
            role,
            status,
            onboarding_status
          `)
          .eq(
            "email",
            user.email
          )
          .maybeSingle();


      if (result.error) {

        throw result.error;

      }


      if (result.data) {

        return result.data;

      }

    }


    throw new Error(
      "Your login account is not linked to a Chama member."
    );

  }


  /* ============================================================
     CURRENT GROUP
     ============================================================ */

  async function getCurrentGroup() {

    const supabase =
      getSupabase();

    const member =
      await getCurrentMember();


    if (!member.group_id) {

      throw new Error(
        "Your member account is not linked to a group."
      );

    }


    const {
      data,
      error
    } =
      await supabase
        .from("groups")
        .select(`
          id,
          name,
          category,
          description,
          monthly_contribution
        `)
        .eq(
          "id",
          member.group_id
        )
        .maybeSingle();


    if (error) {

      throw error;

    }


    if (!data) {

      throw new Error(
        "Your Chama group could not be found."
      );

    }


    return data;

  }


  /* ============================================================
     FETCH MEMBERS
     ============================================================ */

  async function fetchMembers() {

    const supabase =
      getSupabase();

    const group =
      await getCurrentGroup();


    const {
      data,
      error
    } =
      await supabase
        .from("members")
        .select(`
          id,
          group_id,
          member_number,
          membership_number,
          name,
          phone,
          role,
          status,
          email,
          onboarding_status
        `)
        .eq(
          "group_id",
          group.id
        )
        .order(
          "name",
          {
            ascending: true
          }
        );


    if (error) {

      throw error;

    }


    return data || [];

  }


  /* ============================================================
     FETCH GOALS
     ============================================================ */

  async function fetchGoals(
    options = {}
  ) {

    const supabase =
      getSupabase();

    const group =
      await getCurrentGroup();


    let query =
      supabase
        .from("contribution_goals")
        .select(`
          id,
          group_id,
          goal_name,
          category,
          description,
          frequency,
          target_amount,
          status
        `)
        .eq(
          "group_id",
          group.id
        )
        .order(
          "goal_name",
          {
            ascending: true
          }
        );


    if (
      options.activeOnly
    ) {

      query =
        query.eq(
          "status",
          "active"
        );

    }


    const {
      data,
      error
    } =
      await query;


    if (error) {

      throw error;

    }


    return data || [];

  }


  /* ============================================================
     FETCH CONTRIBUTIONS
     ============================================================ */

  async function fetchContributions() {

    const supabase =
      getSupabase();

    const group =
      await getCurrentGroup();


    const {
      data,
      error
    } =
      await supabase
        .from("contributions")
        .select(`
          id,
          group_id,
          member_id,
          amount,
          contribution_type,
          month,
          payment_method,
          reference,
          recorded_by,
          created_at,
          goal_id,
          contribution_date,
          notes,
          members:member_id (
            id,
            name,
            member_number
          ),
          goals:goal_id (
            id,
            goal_name
          )
        `)
        .eq(
          "group_id",
          group.id
        )
        .order(
          "contribution_date",
          {
            ascending: false
          }
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        );


    if (error) {

      throw error;

    }


    return data || [];

  }


  /* ============================================================
     RECORD CONTRIBUTION
     ============================================================ */

  async function recordContribution(
    payload
  ) {

    const supabase =
      getSupabase();

    const currentMember =
      await getCurrentMember();

    const group =
      await getCurrentGroup();


    if (
      !payload ||
      !payload.memberId
    ) {

      throw new Error(
        "Please select a member."
      );

    }


    const amount =
      Number(
        payload.amount
      );


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      throw new Error(
        "Please enter a valid contribution amount."
      );

    }


    if (
      !payload.month
    ) {

      throw new Error(
        "Please enter the contribution month."
      );

    }


    const row = {

      group_id:
        group.id,

      member_id:
        payload.memberId,

      amount:
        amount,

      contribution_type:
        payload.contributionType ||
        "monthly",

      month:
        payload.month,

      payment_method:
        payload.method ||
        "M-Pesa",

      reference:
        payload.reference ||
        null,

      recorded_by:
        currentMember.id,

      goal_id:
        payload.goalId ||
        null,

      contribution_date:
        payload.contributionDate ||
        new Date()
          .toISOString()
          .slice(
            0,
            10
          ),

      notes:
        payload.notes ||
        null

    };


    const {
      data,
      error
    } =
      await supabase
        .from("contributions")
        .insert(
          row
        )
        .select("*")
        .single();


    if (error) {

      throw error;

    }


    return data;

  }


  /* ============================================================
     GLOBAL EXPORTS
     ============================================================ */

  window.chamaData = {

    getCurrentUser:
      getCurrentUser,

    getCurrentMember:
      getCurrentMember,

    getCurrentGroup:
      getCurrentGroup,

    fetchMembers:
      fetchMembers,

    fetchGoals:
      fetchGoals,

    fetchContributions:
      fetchContributions,

    recordContribution:
      recordContribution

  };


  /*
   * Global aliases for existing pages.
   */

  window.fetchMembers =
    fetchMembers;

  window.fetchGoals =
    fetchGoals;

  window.fetchContributions =
    fetchContributions;

  window.recordContribution =
    recordContribution;

  window.fetchGroup =
    getCurrentGroup;

})();
