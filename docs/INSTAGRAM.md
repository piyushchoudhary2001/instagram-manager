# Publishing to Instagram

The app can post an approved carousel or reel straight to the account. This is the setup, once.

Your credentials live in `.env.local` on your machine. That file is git-ignored, the app only ever reports whether a value is *set*, and any token-shaped string is stripped out of errors before they are shown. Do not paste a token into a chat — not to Claude, not anywhere.

## What you need first

- **@build.it01 as a Business or Creator account.** Settings → Account type. The publishing API does not work on a personal account.
- **A Meta developer app**, at [developers.facebook.com](https://developers.facebook.com). Free.

## 1. Create the app

Start at [developers.facebook.com/apps/creation](https://developers.facebook.com/apps/creation/) — the "Build with us" menu on the homepage is for other products and does not lead here.

1. **App details** — a name (`build.it01 manager` is fine) and a contact email. Next.
2. **Use cases** — pick **Manage messaging & content on Instagram**. This is the one: it carries `instagram_business_basic`, `instagram_business_content_publish` and `instagram_business_manage_insights`, which is exactly what this app uses. Incompatible use cases grey out once you pick it, and a use case **cannot be removed later**, so take the right one now. Next.
3. **Business** — choose *I don't want to connect a business portfolio yet*. A portfolio is only needed for data you do not own, and you own this account. Next.
4. **Requirements**, then **Overview** → **Go to dashboard**.

There is no longer an app-type screen; the use case sets that up for you.

There are two ways Meta lets an app talk to Instagram, and they use different hosts:

| | Instagram Login | Facebook Login for Business |
|---|---|---|
| Host | `graph.instagram.com` | `graph.facebook.com` |
| Needs a Facebook Page | no | yes, linked to the account |
| Token | Instagram user token | Page access token |
| `.env.local` | `INSTAGRAM_LOGIN=instagram` | `INSTAGRAM_LOGIN=facebook` |

**Instagram Login is the simpler one** and is what the app defaults to. Use the Facebook path only if the account is already tied into a Page you manage.

## 2. Permissions

On the dashboard, open the use case and customise it. `public_profile` comes as standard; tick these three:

- `instagram_business_basic` — read the account
- `instagram_business_content_publish` — post
- `instagram_business_manage_insights` — read the numbers

Nothing else is needed. (On the Facebook path they are `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` plus `pages_read_engagement`.)

Standard Access is enough for an account you own and have added to your own app — no App Review.

## 3. Get a long-lived token

Short-lived tokens last an hour, which is useless here. In the dashboard go to **Instagram → API setup with Instagram business login**, click **Generate token** next to @build.it01 and log in. That gives you a token good for about 60 days, refreshable before it expires.

The same panel usually shows the **Instagram account ID**. If it doesn't, paste this in a browser once you have the token — the `user_id` it returns is the ID:

```
https://graph.instagram.com/v26.0/me?fields=user_id,username&access_token=YOUR_TOKEN
```

## 4. Fill in .env.local

```bash
cp .env.example .env.local
```

```
INSTAGRAM_ACCESS_TOKEN=…            # the long-lived token
INSTAGRAM_ACCOUNT_ID=178414…        # the numeric id
INSTAGRAM_LOGIN=instagram
INSTAGRAM_API_VERSION=v26.0         # current as of Jul 2026; bump when Meta ships a new one
PUBLIC_MEDIA_BASE_URL=              # see below
```

Restart `npm run dev`. The Publishing page should now show the handle, the follower count, and how much of the day's posting quota is used.

## 5. The part that surprises people: public media

Instagram does not accept an upload. You give it a **URL** and it fetches the file itself — so the images have to be reachable from the internet for the minute or two a publish takes. `localhost` will not do.

The simplest way is a tunnel to the app you are already running:

```bash
cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
```

Put the https address it prints into `PUBLIC_MEDIA_BASE_URL`, restart the app, publish, then **take the tunnel down**.

Two things worth knowing while a tunnel is up:

- It exposes the whole app, not just the images. Keep it short.
- The media links the app hands Instagram are signed and expire after 30 minutes, so the files are not browsable by anyone who stumbles onto the tunnel. Set `PUBLISH_MEDIA_SECRET` if you want those links to survive a restart.

If you would rather not tunnel at all: point `PUBLIC_MEDIA_BASE_URL` at any static host you control, and upload the files from `exports/<post-id>/publish/` there before publishing. The app builds the same URLs either way.

## 6. Publish

Open an approved post → **Publish** tab → *Publish now*. The app renders the slides as JPEGs, creates a container per image, builds the carousel, waits for Instagram to finish processing, publishes, and writes the media id and permalink back into the post's JSON.

If anything is not ready, the tab says exactly what — unapproved post, missing credentials, no tunnel, too many slides.

## The limits that shape all this

| | |
|---|---|
| Carousel size | **10 images** via the API. The app allows 20 for posts you do by hand, so a long carousel has to be trimmed or posted manually. |
| Image format | **JPEG only.** The app converts; you do not have to. |
| Posts per day | 100 through the API, carousels counting as one. |
| Reels | Work, but **trending audio cannot be attached through the API**. A reel published this way keeps whatever audio is in the file, which for reach is usually the wrong trade. Build the cut, then post it in the app with a trending track. |
| Stories | Not wired up here. |
| Scheduling | The API has none. Approve it here and post at the time, or use Instagram's own scheduler. |

## The numbers

```bash
npm run insights
```

or the **Sync insights** button on the Publishing page. It pulls saves, shares, reach, views, likes, comments, profile visits and follows for everything marked posted, and writes them into each post's file next to the content. It also updates the follower count on the calendar.

Posts you published by hand get their numbers too: paste the permalink when you mark the post as posted, and the sync matches it against your recent media to find the media id.

Metrics move around — Meta deprecated `impressions` for anything posted after July 2024 and some metrics are still "in development" — so the client asks for the whole set, and if the account refuses it, falls back to asking one metric at a time and keeps whatever comes back.

## When something fails

- **"Not configured yet"** — the app only reads `.env.local` at startup. Restart it.
- **"Instagram could not process that media"** — nearly always the media URL. Check the tunnel is still up and that `PUBLIC_MEDIA_BASE_URL` has no trailing slash and starts with `https`.
- **An error mentioning a permission** — the token was generated before you added that scope. Generate it again.
- **Nothing in insights** — a brand new post has no numbers for a while, and accounts under 100 followers do not get some account-level metrics at all.
