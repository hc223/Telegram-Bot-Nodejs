### Telegram Bot Integration with MySQL

A Telegram robot based on the [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) library. The robot has functions such as user registration, invitation code generation, daily check-in, activation code usage, and membership expiration check.

### Features

1. **User Registration and Management:**
   - New users can register using the `/start` command. Registration includes username validation and optional referral via invite codes.
   - User details such as registration date, user group (regular user, member, banned), and membership expiration time (`expire_time`) are stored in MySQL.

2. **Membership Management and Expiry Handling:**
   - Membership management is based on `expire_time`. A scheduled task checks hourly for expired memberships and downgrades them accordingly.

3. **Points System:**
   - Users can accumulate points (`score`) by using the daily check-in command `/checkin`.
   - Special activation codes (`/key [code]`) can be used for membership upgrades or increasing points.

4. **Invitation System:**
   - Users can generate invitation codes (`/invite`) to invite others. Successfully registered invitees reward the inviter with bonus points.

5. **Bot Commands:**
   - `/start [invite_code]`: Register and start using the bot, optionally with an invite code.
   - `/help`: Get help and command usage instructions.
   - `/checkin`: Daily check-in to earn points.
   - `/key [code]`: Use a special code for membership upgrade or points increase.
   - `/invite`: Generate an invitation link to invite others.

6. **Integration with Telegram:**
   - Uses `node-telegram-bot-api` for bot interactions, including sending messages and handling commands.
   - Supports private messaging for user interaction and provides inline keyboards for command navigation.

### Requirements

- Node.js
- [yran](https://yarnpkg.com/getting-started)
- MySQL database
- Telegram bot token

### Setup Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hc223/Telegram-Bot-Nodejs-MySQL.git
   cd Telegram-Bot-Nodejs-MySQL
2. Install dependencies：
    ```
    yarn install
3. Configure Telegram bot:

    Rename `.env.example` to `.env` and fill in MySQL database configuration and Telegram bot token details.
4. Run the application：
    ```
    node bot.js
