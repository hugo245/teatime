const style = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #F7F3EE; color: #1F2A24; margin: 0; }
  main { max-width: 680px; margin: 0 auto; padding: 48px 24px 64px; line-height: 1.6; font-size: 18px; }
  h1 { font-size: 34px; margin: 0 0 8px; }
  h2 { font-size: 22px; margin-top: 32px; }
  p.updated { color: #5C6660; margin-top: 0; }
  a { color: #2E6B4E; }
`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${style}</style></head><body><main>${body}</main></body></html>`;
}

export function privacyPage(contact: string) {
  return page(
    'TeaTime Privacy Policy',
    `<h1>Privacy Policy</h1>
<p class="updated">Last updated October 2026</p>
<p>TeaTime helps people have friendly video chats. We collect as little information as possible.</p>
<h2>What we store</h2>
<p>The first name, place, short description, interests and photo you choose to add to your profile. A list of your friends, friend requests and the people you have blocked. The date and length of your calls, so we can show who you met recently. Reports you send or receive.</p>
<h2>What we do not store</h2>
<p>We never record, store or listen to your calls. Video and sound travel directly between the two phones whenever possible and are encrypted.</p>
<h2>Who can see your profile</h2>
<p>Only the people you are matched with and the friends you add can see your name, place, description, interests and photo.</p>
<h2>Deleting your data</h2>
<p>You can delete your account at any time in the app under Profile, then Delete my account. This removes your profile, photo, friends and call history right away.</p>
<h2>Contact</h2>
<p>Questions? Email us at <a href="mailto:${contact}">${contact}</a>.</p>`,
  );
}

export function termsPage(contact: string) {
  return page(
    'TeaTime Community Rules',
    `<h1>Community Rules and Terms</h1>
<p class="updated">Last updated October 2026</p>
<p>TeaTime is a place for kind and friendly conversation. By using TeaTime you agree to these rules.</p>
<h2>Be kind</h2>
<p>Treat everyone with respect. No bullying, hate, threats or rude language.</p>
<h2>Keep it clean</h2>
<p>No nudity, sexual content or anything you would not show at a family tea party.</p>
<h2>Never ask for money</h2>
<p>Do not ask anyone for money, bank details, passwords or gifts. If someone asks you, end the call and report them.</p>
<h2>Be yourself</h2>
<p>Do not pretend to be someone else.</p>
<h2>What happens if rules are broken</h2>
<p>We review every report. People who break the rules are removed from TeaTime. There is no tolerance for objectionable content or abusive behaviour.</p>
<h2>Contact</h2>
<p>Email us at <a href="mailto:${contact}">${contact}</a>.</p>`,
  );
}
