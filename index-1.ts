import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

/* Production application URL — no GitHub Pages redirect. */
const REDIRECT_TO =
  "https://chamalive.co.ke/activate-account.html";

function response(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: CORS
    }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: CORS
    });
  }

  if (req.method !== "POST") {
    return response(
      { error: "Method not allowed" },
      405
    );
  }

  try {
    const authorization =
      req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return response(
        {
          error:
            "Missing authorization token"
        },
        401
      );
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey
    ) {
      return response(
        {
          error:
            "Supabase environment is not configured"
        },
        500
      );
    }

    const caller =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization:
                authorization
            }
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );

    const {
      data: userData,
      error: userError
    } = await caller.auth.getUser();

    if (
      userError ||
      !userData.user
    ) {
      return response(
        {
          error:
            "Invalid or expired login session. Please sign in again."
        },
        401
      );
    }

    const admin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );

    const {
      data: currentMember,
      error: currentMemberError
    } = await admin
      .from("members")
      .select(
        "id, group_id, role, status, onboarding_status"
      )
      .or(
        `auth_user_id.eq.${userData.user.id},user_id.eq.${userData.user.id}`
      )
      .limit(1)
      .maybeSingle();

    if (currentMemberError) {
      return response(
        {
          error:
            "Unable to identify your group membership",
          details:
            currentMemberError.message
        },
        500
      );
    }

    if (!currentMember) {
      return response(
        {
          error:
            "Your account is not linked to a member record"
        },
        403
      );
    }

    const role = String(
      currentMember.role || ""
    ).toLowerCase();

    if (
      !["admin", "chairperson"].includes(
        role
      )
    ) {
      return response(
        {
          error:
            "Only an administrator or chairperson can send member invitations"
        },
        403
      );
    }

    if (
      String(
        currentMember.status || ""
      ).toLowerCase() !== "active"
    ) {
      return response(
        {
          error:
            "Your membership is not active"
        },
        403
      );
    }

    if (
      String(
        currentMember.onboarding_status || ""
      ).toLowerCase() !== "active"
    ) {
      return response(
        {
          error:
            "Your member onboarding is not active"
        },
        403
      );
    }

    const body =
      await req
        .json()
        .catch(() => ({}));

    const memberId = String(
      body?.member_id || ""
    ).trim();

    if (!memberId) {
      return response(
        {
          error: "member_id is required"
        },
        400
      );
    }

    const {
      data: member,
      error: memberError
    } = await admin
      .from("members")
      .select(
        "id, group_id, member_number, membership_number, name, email, role, status, onboarding_status, auth_user_id, user_id"
      )
      .eq(
        "id",
        memberId
      )
      .eq(
        "group_id",
        currentMember.group_id
      )
      .maybeSingle();

    if (memberError) {
      return response(
        {
          error:
            "Unable to retrieve the member",
          details:
            memberError.message
        },
        500
      );
    }

    if (!member) {
      return response(
        {
          error:
            "Member was not found in your group"
        },
        404
      );
    }

    const email = String(
      member.email || ""
    )
      .trim()
      .toLowerCase();

    if (!email) {
      return response(
        {
          error:
            "Add an email address to this member before sending an invitation"
        },
        400
      );
    }

    if (
      String(member.status || "")
        .toLowerCase() !== "active"
    ) {
      return response(
        {
          error:
            "Only active members can receive invitations"
        },
        400
      );
    }

    let authUserId =
      member.auth_user_id ||
      member.user_id ||
      null;

    let mode =
      "existing-account";

    if (!authUserId) {
      let page = 1;
      let existing = null;

      /*
       * Search Auth users page-by-page instead of assuming the first
       * 1,000 users contain the target email.
       */
      while (!existing) {
        const {
          data: users,
          error: usersError
        } = await admin.auth.admin.listUsers({
          page,
          perPage: 1000
        });

        if (usersError) {
          return response(
            {
              error:
                "Unable to check existing login accounts",
              details:
                usersError.message
            },
            500
          );
        }

        existing =
          users.users.find(
            (u) =>
              String(
                u.email || ""
              ).toLowerCase() ===
              email
          ) || null;

        if (
          users.users.length < 1000
        ) {
          break;
        }

        page += 1;
      }

      if (existing) {
        authUserId =
          existing.id;
      } else {
        const {
          data: created,
          error: createError
        } = await admin.auth.admin.createUser({
          email,
          email_confirm: false,
          user_metadata: {
            full_name:
              member.name,
            member_id:
              member.id,
            group_id:
              member.group_id,
            member_number:
              member.member_number,
            membership_number:
              member.membership_number,
            role:
              member.role
          }
        });

        if (
          createError ||
          !created.user
        ) {
          return response(
            {
              error:
                `Unable to create the member login account: ${createError?.message || "No user returned"}`
            },
            400
          );
        }

        authUserId =
          created.user.id;

        mode =
          "new-account";
      }
    }

    /*
     * Prevent one Auth identity from being silently attached to
     * two different member records.
     */
    const {
      data: conflictingMember,
      error: conflictError
    } = await admin
      .from("members")
      .select(
        "id, group_id, name, email"
      )
      .neq(
        "id",
        member.id
      )
      .or(
        `auth_user_id.eq.${authUserId},user_id.eq.${authUserId}`
      )
      .limit(1)
      .maybeSingle();

    if (conflictError) {
      return response(
        {
          error:
            "Unable to verify Auth identity ownership",
          details:
            conflictError.message
        },
        500
      );
    }

    if (conflictingMember) {
      return response(
        {
          error:
            "This login account is already linked to another member record. Resolve that account linkage before sending this invitation."
        },
        409
      );
    }

    if (!authUserId) {
      return response(
        {
          error:
            "Auth account could not be identified"
        },
        500
      );
    }

    if (mode === "new-account") {
      /*
       * Native Supabase Auth invitation email.
       * No Brevo/Resend/API key is used here.
       */
      await admin.auth.admin.deleteUser(
        authUserId
      );

      const {
        data: invited,
        error: inviteError
      } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo:
            REDIRECT_TO,
          data: {
            full_name:
              member.name,
            member_id:
              member.id,
            group_id:
              member.group_id,
            member_number:
              member.member_number,
            membership_number:
              member.membership_number,
            role:
              member.role
          }
        }
      );

      if (
        inviteError ||
        !invited.user
      ) {
        return response(
          {
            error:
              `Supabase Auth invitation email failed: ${inviteError?.message || "No user returned"}`,
            email_sent:
              false
          },
          502
        );
      }

      authUserId =
        invited.user.id;
    } else {
      const {
        error: resetError
      } = await caller.auth.resetPasswordForEmail(
        email,
        {
          redirectTo:
            REDIRECT_TO
        }
      );

      if (resetError) {
        return response(
          {
            error:
              `Supabase Auth email failed: ${resetError.message}`,
            email_sent:
              false
          },
          502
        );
      }
    }

    const now =
      new Date().toISOString();

    const {
      data: updatedMember,
      error: updateError
    } = await admin
      .from("members")
      .update({
        auth_user_id:
          authUserId,
        invited_at:
          now,
        onboarding_status:
          "invited"
      })
      .eq(
        "id",
        member.id
      )
      .eq(
        "group_id",
        currentMember.group_id
      )
      .select(
        "id, member_number, membership_number, email, auth_user_id, invited_at, onboarding_status"
      )
      .single();

    if (updateError) {
      return response(
        {
          error:
            "Invitation email was sent, but the member record could not be updated",
          details:
            updateError.message,
          email_sent:
            true,
          auth_user_id:
            authUserId
        },
        500
      );
    }

    return response({
      success:
        true,
      message:
        `Invitation sent to ${email}`,
      email_sent:
        true,
      email_type:
        mode === "new-account"
          ? "invite"
          : "password-reset",
      member:
        updatedMember,
      redirect_to:
        REDIRECT_TO
    });
  } catch (error) {
    console.error(
      "send-member-invitation error",
      error
    );

    return response(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error"
      },
      500
    );
  }
});
