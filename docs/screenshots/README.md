# Guide screenshots

These are real interface captures, not generated mockups. The guide embeds the
image pixels so its LaTeX source works without a multi-file project. PNGs are
retained here for review and future updates. No bot token is shown.

## Captured for this guide

- `create-application.png`: Discord Developer Portal's empty creation dialog.
- `token-button.png`: Bot / Token / Reset Token button only.
- `message-content.png`: Message Content Intent row only.
- `oauth2-scopes.png`: scope selector before checking bot and applications.commands.

These four captures use the English (US) interface. Browser tabs, account menus
and unrelated content have been cropped out. The account language was restored
after capturing the screenshots.

## Supplied reference

- `bot-permissions.png`: permission selection supplied by the repository author;
  used as the exact reference for the requested 21 permissions.

## Discord help-centre screenshots

`developer-mode.png`, `copy-user-id.png`, `copy-server-id.png`, and
`copy-channel-id.png` come from Discord's official article:
[Where can I find my User/Server/Message ID?](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID)
The GIF examples were converted to static final frames for print.

- Developer Mode: https://support.discord.com/hc/article_attachments/30911629526551
- User ID: https://support.discord.com/hc/article_attachments/30911629534871
- Server ID: https://support.discord.com/hc/article_attachments/30911616506647
- Channel ID: https://support.discord.com/hc/article_attachments/30911616532119

`application-id.png` comes from Discord's official article
[Where can I find my Application/Team/Server ID?](https://support-dev.discord.com/hc/en-us/articles/360028717192-Where-can-I-find-my-Application-Team-Server-ID)
(source image: https://support-dev.discord.com/hc/article_attachments/31564919143575).
It shows Discord's sample application, not the reader's ID.

Discord interface images belong to their respective rights holders.

## Automated-install guide, 8 October 2026

The three-page `docs/guide-auto.tex` embeds ten captures and uses the shared
portal and help-centre images listed above. Two additional captures are included:

- `oauth2-scopes-selected.png`: actual URL Generator with only `bot` and
  `applications.commands` checked. Both states were verified in the native
  browser's accessibility tree and screenshot. Cropped to the scope grid;
  labels and checkbox states are unmodified. No invitation was submitted.
- `discord-reply.png`: actual reply in the deployed Debian bot's channel.
  Cropped to the test mentions and beginning of the reply, excluding unrelated
  messages and account/browser UI. It demonstrates ordinary message delivery,
  not image or file-tool behavior.

The automated edition uses five restricted bot permissions; the older manual
edition's 21-permission reference remains available for that separate profile.
No bot tokens or other credentials are shown.
