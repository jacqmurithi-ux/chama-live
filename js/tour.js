function getMemberSlides() {

  return [

    {
      icon: "👋",
      eyebrow: "MEMBER PORTAL",
      title: "Welcome to your Member Portal",
      description:
        "Everything about your participation in the Chama, in one place.",

      visual:
        featureGrid([
          {
            icon: "💰",
            title: "My Contributions",
            text: "Track your payments"
          },
          {
            icon: "🧾",
            title: "My Statement",
            text: "View your history"
          },
          {
            icon: "💳",
            title: "My Loans",
            text: "Track your balance"
          },
          {
            icon: "📅",
            title: "Meetings",
            text: "Stay involved"
          }
        ]),

      details:
        detailList([
          "Use the Member Portal to review information relevant to your own participation.",
          "Check your financial records and contribution status.",
          "Review meetings, announcements and other information shared with members.",
          "Your available actions depend on the permissions assigned to your account."
        ])
    },

    {
      icon: "🏠",
      eyebrow: "MY DASHBOARD",
      title: "See your Chama status",
      description:
        "Your member dashboard gives you a quick view of your participation.",

      visual:
        exampleStats([
          {
            label: "My contributions",
            value: "KSh 1,000"
          },
          {
            label: "Outstanding",
            value: "KSh 500"
          },
          {
            label: "Loan balance",
            value: "KSh 8,000"
          },
          {
            label: "Meetings",
            value: "2 upcoming"
          }
        ]),

      details:
        detailList([
          "OPEN — Start from your Member Dashboard.",
          "CHECK — Review your contribution total, outstanding amount and loan information.",
          "REVIEW — Check upcoming meetings and announcements.",
          "COMPARE — If a figure appears incorrect, contact the appropriate group administrator rather than changing financial records yourself.",
          "EXPECT — The dashboard provides a summary of your current member information."
        ])
    },

    {
      icon: "💰",
      eyebrow: "MY CONTRIBUTIONS",
      title: "Track your payments",
      description:
        "See what you were expected to contribute, what you paid and your current status.",

      visual:
        `
        <div class="tour-example">

          <div class="tour-example-stat">
            <span>September</span>
            <strong>✓ KSh 1,000</strong>
          </div>

          <div class="tour-example-stat">
            <span>October</span>
            <strong>Partial · KSh 500</strong>
          </div>

        </div>
        `,

      details:
        detailList([
          "OPEN — Go to your contribution information.",
          "CHECK — Review the contribution period and expected amount.",
          "REVIEW — Check payments recorded against your member account.",
          "IDENTIFY — Look for paid, partial or outstanding periods.",
          "VERIFY — Compare your personal payment evidence with the record shown in CHAMA LIVE.",
          "EXPECT — Your contribution history should show the transactions recorded for your member account.",
          "CONTACT — If a payment is missing or incorrect, contact the group administrator responsible for financial records."
        ])
    },

    {
      icon: "🧾",
      eyebrow: "MY STATEMENT",
      title: "Know your financial history",
      description:
        "Your statement brings your recorded Chama financial activity together.",

      visual:
        featureGrid([
          {
            icon: "💰",
            title: "Contributions",
            text: "Your contribution history"
          },
          {
            icon: "🧾",
            title: "Payments",
            text: "Recorded payments"
          },
          {
            icon: "🧾",
            title: "Receipts",
            text: "Your receipts"
          },
          {
            icon: "💳",
            title: "Loans",
            text: "Loans and repayments"
          }
        ]),

      details:
        detailList([
          "OPEN — Open your member statement.",
          "REVIEW — Check contributions, payments, receipts and loan activity shown for your account.",
          "CHECK — Review dates and amounts against your own records.",
          "IDENTIFY — Note any missing, duplicate or unexpected transactions.",
          "DOWNLOAD — Download your statement when that feature is available.",
          "EXPECT — The statement should provide a consolidated view of the financial records associated with your member account."
        ])
    },

    {
      icon: "💳",
      eyebrow: "MY LOANS",
      title: "Manage your loan information",
      description:
        "See the information your Chama has recorded about your loans.",

      visual:
        exampleStats([
          {
            label: "Loan amount",
            value: "KSh 20,000"
          },
          {
            label: "Outstanding",
            value: "KSh 8,000"
          },
          {
            label: "Next payment",
            value: "KSh 2,000"
          }
        ]),

      details:
        detailList([
          "OPEN — Open your loan information.",
          "CHECK — Review the original loan amount and outstanding balance.",
          "REVIEW — Check the repayment schedule and next payment information.",
          "CHECK GUARANTORS — Review guarantor information where it is displayed.",
          "COMPARE — Compare recorded repayments with your own payment records.",
          "EXPECT — The loan information should show the records maintained by your Chama.",
          "CONTACT — Ask the responsible group administrator about discrepancies."
        ])
    },

    {
      icon: "📅",
      eyebrow: "MEETINGS",
      title: "Stay involved",
      description:
        "Keep up with your Chama's meetings and decisions.",

      visual:
        featureGrid([
          {
            icon: "📅",
            title: "Upcoming",
            text: "See scheduled meetings"
          },
          {
            icon: "📝",
            title: "Agenda",
            text: "Know what is planned"
          },
          {
            icon: "📄",
            title: "Minutes",
            text: "Review meeting records"
          },
          {
            icon: "✓",
            title: "Attendance",
            text: "Check your participation"
          }
        ]),

      details:
        detailList([
          "OPEN — Go to Meetings.",
          "CHECK — Review upcoming meeting dates, times and venues.",
          "REVIEW — Read the agenda so you know what is planned.",
          "AFTER MEETING — Review minutes and decisions when they are published.",
          "ATTENDANCE — Check your recorded participation where available.",
          "EXPECT — Meeting information should help you stay informed about group activities."
        ])
    },

    {
      icon: "📈",
      eyebrow: "GROUP ACTIVITY",
      title: "See what your Chama is working on",
      description:
        "Follow group activities, projects and progress that are shared with members.",

      visual:
        featureGrid([
          {
            icon: "📋",
            title: "Activities",
            text: "See current group work"
          },
          {
            icon: "🎯",
            title: "Progress",
            text: "Follow group progress"
          },
          {
            icon: "📅",
            title: "Dates",
            text: "See important timelines"
          },
          {
            icon: "✓",
            title: "Status",
            text: "Follow completed work"
          }
        ]),

      details:
        detailList([
          "OPEN — Review the group activity information available to members.",
          "CHECK — See activities, projects and progress shared by group leadership.",
          "FOLLOW — Review activity status, dates and assigned responsibilities where member-safe information is available.",
          "STAY INFORMED — Use group activity information to understand what the Chama is currently working on.",
          "EXPECT — Member views show group-safe information and do not expose private administrative records."
        ])
    },
         {
      icon: "📢",
      eyebrow: "ANNOUNCEMENTS",
      title: "Stay informed",
      description:
        "Administrators can share important Chama information with members.",

      visual:
        `
        <div class="tour-feature-grid">

          <div class="tour-feature">

            <div class="tour-feature-icon">
              📢
            </div>

            <div>
              <strong>
                Monthly meeting
              </strong>

              <span>
                Saturday, 10:00 AM
              </span>
            </div>

          </div>

          <div class="tour-feature">

            <div class="tour-feature-icon">
              💰
            </div>

            <div>
              <strong>
                September contribution
              </strong>

              <span>
                Deadline: 30 September
              </span>
            </div>

          </div>

        </div>
        `,

      details:
        detailList([
          "OPEN — Review announcements available to your member account.",
          "READ — Check meeting announcements, contribution reminders and other group notices.",
          "CHECK — Pay attention to dates, deadlines and instructions included in each notice.",
          "KEEP — Follow important group communication so you do not miss meetings or required actions.",
          "EXPECT — Announcements provide information shared by authorized group administrators."
        ])
    },

    {
      icon: "🎯",
      eyebrow: "PLANS & GOALS",
      title: "Follow your Chama's plans and goals",
      description:
        "See the plans and contribution goals your group shares with members.",

      visual:
        featureGrid([
          {
            icon: "🎯",
            title: "Goals",
            text: "See group targets"
          },
          {
            icon: "📋",
            title: "Plans",
            text: "Understand group priorities"
          },
          {
            icon: "📈",
            title: "Progress",
            text: "Follow progress"
          },
          {
            icon: "📅",
            title: "Timeline",
            text: "See target dates"
          }
        ]),

      details:
        detailList([
          "OPEN — Review plans and goals available to your member account.",
          "CHECK — See the group's shared objectives and target dates.",
          "FOLLOW — Review progress information where it is available to members.",
          "UNDERSTAND — Use plans and goals to understand the direction and priorities of the Chama.",
          "EXPECT — Management controls remain restricted to authorized group roles."
        ])
    },

    {
      icon: "📋",
      eyebrow: "ACTIVITIES",
      title: "Follow group activities",
      description:
        "Keep track of activities connected to the group's plans and projects.",

      visual:
        featureGrid([
          {
            icon: "📋",
            title: "Current",
            text: "See active activities"
          },
          {
            icon: "👥",
            title: "Assigned",
            text: "See shared responsibilities"
          },
          {
            icon: "📅",
            title: "Dates",
            text: "Follow activity timelines"
          },
          {
            icon: "✓",
            title: "Progress",
            text: "See completion status"
          }
        ]),

      details:
        detailList([
          "OPEN — Review activities shared with members.",
          "CHECK — See activity titles, descriptions, dates and status where available.",
          "FOLLOW — Review progress and completion information.",
          "PARTICIPATE — Use the information to understand activities where you are involved.",
          "EXPECT — Member views remain limited to information appropriate for the whole group."
        ])
    },

    {
      icon: "🏁",
      eyebrow: "MILESTONES",
      title: "Follow important group milestones",
      description:
        "See important achievements, targets and dates recorded for the Chama.",

      visual:
        featureGrid([
          {
            icon: "🏁",
            title: "Milestones",
            text: "See important targets"
          },
          {
            icon: "📅",
            title: "Dates",
            text: "Follow milestone dates"
          },
          {
            icon: "🎯",
            title: "Goals",
            text: "Connect progress to plans"
          },
          {
            icon: "✓",
            title: "Achievements",
            text: "Recognize completed work"
          }
        ]),

      details:
        detailList([
          "OPEN — Review milestones available to members.",
          "CHECK — See milestone titles, dates and shared descriptions.",
          "FOLLOW — Track important targets connected to group plans.",
          "REVIEW — Use milestone information to understand group progress and achievements.",
          "EXPECT — Private administrative information remains outside the member view."
        ])
    },

    {
      icon: "🏢",
      eyebrow: "ASSETS",
      title: "See your Chama's assets",
      description:
        "Members can view group-safe information about assets owned or managed by the Chama.",

      visual:
        featureGrid([
          {
            icon: "🏢",
            title: "Assets",
            text: "See group property"
          },
          {
            icon: "📍",
            title: "Location",
            text: "See recorded location"
          },
          {
            icon: "📅",
            title: "Acquired",
            text: "See acquisition information"
          },
          {
            icon: "✓",
            title: "Status",
            text: "See current status"
          }
        ]),

      details:
        detailList([
          "OPEN — Review the assets available to members.",
          "CHECK — See member-safe asset names, categories, descriptions, locations and status where available.",
          "UNDERSTAND — Use the asset register to understand what property or equipment belongs to the group.",
          "VIEW ONLY — Asset management actions remain restricted to authorized roles.",
          "EXPECT — Sensitive administrative or financial controls are not part of the member view."
        ])
    },

    {
      icon: "👤",
      eyebrow: "MY PROFILE",
      title: "Manage your account",
      description:
        "Keep your personal account information and security settings up to date.",

      visual:
        featureGrid([
          {
            icon: "👤",
            title: "Personal details",
            text: "Name and contact information"
          },
          {
            icon: "🔐",
            title: "Security",
            text: "Password and login controls"
          },
          {
            icon: "🔔",
            title: "Notifications",
            text: "Choose what you receive"
          },
          {
            icon: "📱",
            title: "Contact",
            text: "Keep details current"
          }
        ]),

      details:
        detailList([
          "OPEN — Open your profile or account settings.",
          "REVIEW — Check your name, phone number and email information.",
          "UPDATE — Change personal information only where the application allows you to do so.",
          "SECURITY — Review available login and security controls.",
          "NOTIFICATIONS — Review notification preferences when available.",
          "CHECK — Save permitted changes and confirm that the updated information is displayed correctly.",
          "EXPECT — Your account information should remain consistent with the member record maintained by the group."
        ])
    },

    {
      icon: "🔔",
      eyebrow: "REMINDERS",
      title: "Keep track of important dates",
      description:
        "Use member-visible reminders to stay aware of meetings, activities, milestones and other group actions.",

      visual:
        featureGrid([
          {
            icon: "📅",
            title: "Meetings",
            text: "Remember upcoming meetings"
          },
          {
            icon: "📋",
            title: "Activities",
            text: "Follow important dates"
          },
          {
            icon: "🏁",
            title: "Milestones",
            text: "Track target dates"
          },
          {
            icon: "💰",
            title: "Contributions",
            text: "Remember due dates"
          }
        ]),

      details:
        detailList([
          "CHECK — Review reminders and upcoming dates made available to your member account.",
          "MEETINGS — Pay attention to upcoming meeting dates and times.",
          "ACTIVITIES — Review dates connected to activities or group projects.",
          "MILESTONES — Keep track of important group targets and dates.",
          "CONTRIBUTIONS — Review contribution deadlines when they are communicated to members.",
          "IMPORTANT — Reminder delivery and storage depend on the application's member notification contract; this tour does not assume a separate reminder database table."
        ])
    },

    {
      icon: "🤝",
      eyebrow: "SUPPORT & WELFARE",
      title: "Understand member support",
      description:
        "Members can access appropriate group welfare information while private support cases remain protected.",

      visual:
        featureGrid([
          {
            icon: "🤝",
            title: "Support",
            text: "Understand available welfare support"
          },
          {
            icon: "❤️",
            title: "Welfare",
            text: "Stay aware of group care"
          },
          {
            icon: "🔒",
            title: "Privacy",
            text: "Private cases remain protected"
          },
          {
            icon: "👤",
            title: "My information",
            text: "See member-safe information"
          }
        ]),

      details:
        detailList([
          "OPEN — Review the member-safe Support & Welfare information available to your account.",
          "CHECK — See general welfare information or support guidance shared with members.",
          "PRIVACY — Private support cases belonging to other members are not part of the member view.",
          "PERSONAL — Any information about your own support should be shown only where the application's member contract permits it.",
          "EXPECT — Support and welfare management actions remain restricted to authorized group roles."
        ])
    },
         {
      icon: "🎉",
      eyebrow: "READY",
      title: "You're ready!",
      description:
        "Your Member Portal is ready. Start by checking your dashboard.",

      visual:
        flow([
          {
            icon: "🏠",
            title: "Dashboard"
          },
          {
            icon: "💰",
            title: "Contributions"
          },
          {
            icon: "🧾",
            title: "Statement"
          },
          {
            icon: "📅",
            title: "Meetings"
          }
        ]),

      details:
        detailList([
          "START — Check your dashboard.",
          "FINANCE — Review your contribution status and statement.",
          "LOANS — Review loan information when applicable.",
          "MEETINGS — Keep up with meetings and group decisions.",
          "NOTICES — Check announcements regularly.",
          "PROFILE — Keep your personal account information current.",
          "NEXT — Click Go to Dashboard to enter the application."
        ]),

      final: true
    }

  ];
}
