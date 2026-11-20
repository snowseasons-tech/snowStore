// Course content for the Social Media Marketing academy page.
// Original lessons, exercises and quiz questions written for Snow Seasons Tech customers.
// Loaded by index.html in the browser (window.SMM_COURSE) and by tests/social-media-academy.test.js.
(function (root) {
  const modules = [
    {
      id: "strategy",
      title: "Set your social media goals",
      desc: "Connect every post to a business result before you choose platforms or write a single caption.",
      lesson: [
        "Social media is a means to an end. Before you post, decide what the account should achieve: more enquiries, more repeat customers, a stronger local reputation, or simply being found when people search.",
        "Choose one primary goal for the next 90 days and no more than two supporting goals. A goal such as \"five booked estimates a month from Facebook and Google\" is specific enough to plan around. \"Be more active online\" is not.",
      ],
      outcome: "A written goal, a 90-day target you can measure, and the platforms you will use to reach it.",
      actions: [
        "Write your primary goal in one sentence, including a number and a date.",
        "List the three actions that most directly lead to that result (for example, asking for reviews or sharing before-and-after photos).",
        "Pick no more than two platforms to start with, based on where your customers already spend time.",
      ],
      quiz: [
        {
          q: "Which goal is most useful for planning social media work?",
          options: ["Be more active online", "Get more posts liked", "Book five estimates a month from local search and Facebook within 90 days", "Look professional"],
          answer: 2,
          why: "A useful goal has a number, a time frame and a business outcome you can measure.",
        },
        {
          q: "Why should you limit yourself to one primary goal at a time?",
          options: ["Platforms only allow one goal per account", "A single focus makes it clear which posts and actions matter", "Goals cannot be changed later", "Supporting goals are never useful"],
          answer: 1,
          why: "Several equal priorities usually mean none of them get the attention they need.",
        },
        {
          q: "A customer asks why you post at all. What is the best answer?",
          options: ["Everyone else does it", "To keep the algorithm happy", "Each post is meant to move someone toward a result the business cares about", "To fill the feed"],
          answer: 2,
          why: "Posting is a tool. Tie each piece of content to a goal, even if the link is indirect.",
        },
      ],
    },
    {
      id: "audience",
      title: "Know who you are talking to",
      desc: "Build simple audience profiles so your content speaks to real people with real problems.",
      lesson: [
        "An audience profile describes a person who buys from you: what they need, what worries them, where they look for help, and what would make them choose you. Two or three profiles are enough for a small business.",
        "Use evidence rather than guesses. Read recent reviews, listen to questions customers ask on the phone or at the counter, and look at which posts already get replies from the people you want to reach.",
      ],
      outcome: "Two or three short audience profiles, each with a problem, a question they ask, and a place they already spend time.",
      actions: [
        "Write a profile for your most valuable customer type, including the problem they want solved.",
        "Collect five real questions from customers, reviews or messages and note the exact words they used.",
        "Note which local groups, pages or search terms your audience uses.",
      ],
      quiz: [
        {
          q: "What makes an audience profile useful?",
          options: ["It describes everyone who might ever buy", "It is based on a specific problem and the words real customers use", "It is written once and never changed", "It includes only demographic facts"],
          answer: 1,
          why: "Useful profiles focus on the problem a customer is trying to solve, grounded in real language.",
        },
        {
          q: "Which is the best source of audience insight for a small business?",
          options: ["Guessing what people want", "Copying a competitor's posts", "Customer questions, reviews and messages", "Random trends from the internet"],
          answer: 2,
          why: "Real questions and reviews show what people care about, in their own words.",
        },
        {
          q: "How many audience profiles is a good starting point for a small business?",
          options: ["One hundred", "Two or three", "Exactly one, always", "As many as possible from day one"],
          answer: 1,
          why: "Two or three clear profiles are easier to write for than a long list nobody can picture.",
        },
      ],
    },
    {
      id: "pillars",
      title: "Plan content pillars and a calendar",
      desc: "Use a few repeatable themes to keep your posting steady without starting from a blank page every week.",
      lesson: [
        "Content pillars are three to five themes that your posts return to. A home-services business might use: helpful tips, behind-the-scenes work, customer results, seasonal reminders and community news.",
        "A calendar turns pillars into a rhythm. Plan a realistic number of posts you can keep up for three months, batch the writing into one session a week, and leave room for timely posts.",
      ],
      outcome: "Three to five content pillars and a three-week posting calendar you can keep up.",
      actions: [
        "Choose three to five pillars and write one sentence explaining each.",
        "Plan three weeks of posts so that each pillar appears at least once a week.",
        "Mark two dates for timely content, such as seasonal reminders or local events.",
      ],
      quiz: [
        {
          q: "What is a content pillar?",
          options: ["A paid advertisement", "A recurring theme that your posts return to", "A platform's required format", "A single viral post"],
          answer: 1,
          why: "Pillars give your content a repeatable structure so each post has a clear purpose.",
        },
        {
          q: "What is the main benefit of a posting calendar?",
          options: ["It guarantees more followers", "It replaces the need to know your audience", "It turns intentions into a steady, realistic rhythm", "It removes the need to reply to comments"],
          answer: 2,
          why: "A calendar helps you keep a schedule you can actually sustain, instead of posting in bursts.",
        },
        {
          q: "How should you choose how often to post?",
          options: ["As often as the best accounts do", "A frequency you can keep up consistently for months", "Once a year", "Every hour"],
          answer: 1,
          why: "Consistency beats occasional bursts. Choose a rhythm you can maintain.",
        },
      ],
    },
    {
      id: "copy",
      title: "Write captions and hooks",
      desc: "Open with a clear reason to keep reading, then give the reader one useful thing and one next step.",
      lesson: [
        "The first line of a caption decides whether anyone reads the rest. Lead with the problem, the result or a specific detail: \"Frozen pipes cost one of our neighbours $4,000 last winter. Here is how to prevent it.\" beats \"Happy Monday from our team!\"",
        "Keep most captions short and useful. End with one clear action, such as a question to answer, a link to book, or a prompt to save the post. Avoid asking for three things at once.",
      ],
      outcome: "A set of caption templates with a strong opening line, one useful point, and one clear call to action.",
      actions: [
        "Write three captions for one service, each with a different opening line.",
        "Rewrite one of your recent posts so that its first line names a problem or result.",
        "Add a single call to action to each caption and remove any others.",
      ],
      quiz: [
        {
          q: "Which opening line is most likely to keep a reader going?",
          options: ["Happy Monday from the team!", "Our new service is here.", "Your gutters may be costing you more than you think. Here is how to check.", "Check out our page."],
          answer: 2,
          why: "A specific problem or benefit gives the reader a reason to keep reading.",
        },
        {
          q: "How many calls to action should a caption usually have?",
          options: ["As many as possible", "One clear one", "Five, to be safe", "None, ever"],
          answer: 1,
          why: "A single clear action is easier for people to take than a list of competing requests.",
        },
        {
          q: "What is the purpose of a hook?",
          options: ["To hide the main point", "To make the reader want the rest of the post", "To add hashtags", "To repeat the business name"],
          answer: 1,
          why: "The hook earns attention. The rest of the caption has to deliver on it.",
        },
      ],
    },
    {
      id: "visuals",
      title: "Create visuals that look like your brand",
      desc: "Use a small set of colours, fonts and image styles so people recognise your posts before they read your name.",
      lesson: [
        "Consistency makes posts recognisable. Pick two or three brand colours, one or two fonts, and a simple style for photos (bright and natural, or bold and graphic). Use the same logo placement on every image.",
        "Real photos of your work, team and customers usually outperform stock images because they build trust. Always get permission before posting a customer's face or property, and keep the file sizes reasonable so pages load quickly on phones.",
      ],
      outcome: "A one-page visual guide: colours, fonts, photo style, logo placement, and a rule for when to use stock images.",
      actions: [
        "Choose your brand colours and fonts and record the exact codes.",
        "Take ten photos of real work this month, with permission from anyone who appears.",
        "Create a template for one post type (for example, a before-and-after) and reuse it.",
      ],
      quiz: [
        {
          q: "Why does a consistent visual style matter?",
          options: ["It makes posts recognisable at a glance", "Platforms require it", "It removes the need for captions", "It makes every post look identical"],
          answer: 0,
          why: "Recognition builds familiarity. Consistency does not mean every post is identical.",
        },
        {
          q: "Which type of image usually builds the most trust for a local business?",
          options: ["Generic stock photos", "Real photos of your work and team", "Heavily filtered images", "Screenshots of other businesses"],
          answer: 1,
          why: "Real work shows what you actually do, which is more convincing than generic images.",
        },
        {
          q: "Before posting a photo of a customer's home or face, what should you do?",
          options: ["Post it and apologise later if asked", "Get their permission", "Blur their face, which is always enough", "Nothing, if it is a public place"],
          answer: 1,
          why: "Permission protects your customers and your business. Blurring alone is not a substitute.",
        },
      ],
    },
    {
      id: "platforms",
      title: "Use each platform for its strengths",
      desc: "Adapt the same idea to Facebook, Instagram and Google Business Profile instead of copying one post everywhere.",
      lesson: [
        "Each platform suits different content. Facebook works well for community updates, events and conversations with local groups. Instagram suits strong images, short videos and behind-the-scenes stories. Google Business Profile is where people look for opening hours, reviews, services and recent updates when they search.",
        "Adapt one idea to each platform rather than publishing identical posts everywhere. Check current platform guidance before you rely on specific features, because these tools change often.",
      ],
      outcome: "A short note for each platform you use: the content it suits, the posting rhythm, and who answers messages.",
      actions: [
        "Write one sentence describing what each active platform is best for in your business.",
        "Update your Google Business Profile details, including hours, services and photos.",
        "Adapt one of your existing posts for a second platform, changing the length and format.",
      ],
      quiz: [
        {
          q: "Which platform is best for keeping your opening hours and services visible in local search?",
          options: ["Google Business Profile", "A short-form video app", "A private group chat", "A printed flyer only"],
          answer: 0,
          why: "Google Business Profile is designed to show business details and updates to people searching nearby.",
        },
        {
          q: "What is the better way to use several platforms?",
          options: ["Post identical content everywhere", "Adapt each idea to the strengths of each platform", "Use only one platform forever", "Post only on weekends"],
          answer: 1,
          why: "Adapting content to each platform's format and audience gets better results than copying.",
        },
        {
          q: "Why should you check current platform guidance before relying on a feature?",
          options: ["Platform features and rules change often", "It is never necessary", "Only paid accounts can read it", "Guidance is always out of date"],
          answer: 0,
          why: "Platforms change features and policies regularly, so verify before you plan around them.",
        },
      ],
    },
    {
      id: "community",
      title: "Build community through replies",
      desc: "Answer people quickly and well, because conversation is what turns followers into customers.",
      lesson: [
        "Most of the value on social media comes from conversation. A reply to a question, a thank-you for a review, or a friendly answer to a complaint shows future customers how you treat people.",
        "Set a response standard you can keep: for example, reply to comments and messages within one working day, and never leave a complaint without a calm, helpful public reply that invites the person to continue in private.",
      ],
      outcome: "A response standard, a list of common questions with short answers, and a plan for handling complaints.",
      actions: [
        "Set a reply time you can keep and write it down.",
        "Write answers to the five questions you hear most often.",
        "Draft a calm reply template for a complaint and a separate one for a positive review.",
      ],
      quiz: [
        {
          q: "What is the best first step when someone leaves a public complaint?",
          options: ["Delete the comment", "Reply calmly and invite the person to continue in private", "Argue the facts in public", "Ignore it"],
          answer: 1,
          why: "A calm reply shows readers how you handle problems. Moving details to private messages protects everyone's privacy.",
        },
        {
          q: "What helps a response standard work?",
          options: ["Promising instant replies at all times", "A time you can realistically keep", "Replying only to positive comments", "Never writing it down"],
          answer: 1,
          why: "A standard that you can keep builds trust. One you cannot keep damages it.",
        },
        {
          q: "Which activity most directly builds community?",
          options: ["Posting more often without replies", "Answering questions and thanking people", "Buying followers", "Reposting the same ad"],
          answer: 1,
          why: "Real conversation is the core of community. Volume without replies rarely creates it.",
        },
      ],
    },
    {
      id: "paid",
      title: "Use paid promotion carefully",
      desc: "Boost only the posts that already work, set a clear budget and check the results.",
      lesson: [
        "Paid promotion extends the reach of content that already performs well. Boosting a post with no clear goal, audience or budget usually spends money without useful results.",
        "Start with a small, fixed budget and one clear objective, such as messages or bookings. Use the audience you wrote down in module 2, and stop the promotion if the cost of a result is higher than the value of a customer.",
      ],
      outcome: "A small test budget, one objective, a target audience, and a stopping rule.",
      actions: [
        "Pick one organic post that already gets engagement and write down why it works.",
        "Set a fixed test budget you can afford to lose and write down your stopping rule.",
        "Choose one measurable objective and the audience you will target.",
      ],
      quiz: [
        {
          q: "Which post is usually the best candidate for paid promotion?",
          options: ["A random post with no engagement", "A post that already performs well organically", "A post with spelling errors", "The newest post, regardless of results"],
          answer: 1,
          why: "Promotion amplifies content that is already working, so there is less risk of wasting budget.",
        },
        {
          q: "What should a small test campaign start with?",
          options: ["The largest budget you can find", "A fixed budget and one clear objective", "No goal, to see what happens", "Every platform at once"],
          answer: 1,
          why: "A fixed budget and a single objective make results easy to judge.",
        },
        {
          q: "When should you stop a paid promotion?",
          options: ["Never", "When the cost of each result is higher than the value it brings", "After one day, always", "Only when a customer complains"],
          answer: 1,
          why: "Decide your stopping rule in advance, based on what a result is worth to the business.",
        },
      ],
    },
    {
      id: "measure",
      title: "Measure results and improve",
      desc: "Track a few numbers that connect to your goal, review them monthly and change one thing at a time.",
      lesson: [
        "Choose a small set of measures tied to your goal from module 1: for example, enquiries from social channels, bookings, review count, or messages received. Vanity numbers such as likes are useful only when they lead to one of these results.",
        "Review your numbers once a month. Keep a simple log of what you changed and what happened next. Change one thing at a time, so you can tell what made the difference.",
      ],
      outcome: "A one-page monthly report with three measures, a short list of what you changed, and one decision for next month.",
      actions: [
        "Pick three measures tied to your primary goal and write how you will count them.",
        "Set a monthly review date in your calendar.",
        "Create a simple log with the date, the change you made and the result.",
      ],
      quiz: [
        {
          q: "Which measure is most useful if your goal is more bookings?",
          options: ["Total likes", "Bookings and enquiries that came from social channels", "Number of hashtags used", "Follower count alone"],
          answer: 1,
          why: "Measures should connect to the goal. Bookings and enquiries show whether social media is working.",
        },
        {
          q: "Why should you change one thing at a time?",
          options: ["Platforms only allow one change", "So you can tell which change caused the result", "Changes are never useful", "It makes reports longer"],
          answer: 1,
          why: "Changing several things together makes it impossible to know what worked.",
        },
        {
          q: "What is a good rhythm for reviewing social media results?",
          options: ["Every hour", "Once a month, with a log of changes", "Only when something goes wrong", "Never, if the feed looks busy"],
          answer: 1,
          why: "A regular monthly review gives enough data to learn from without daily noise.",
        },
      ],
    },
  ];

  const course = {
    id: "social-media-marketing",
    title: "Social Media Marketing — From Strategy to Results",
    modules,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = course;
  root.SMM_COURSE = course;
})(typeof window !== "undefined" ? window : globalThis);
