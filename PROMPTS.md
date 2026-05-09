```
I’d like to build a web game using the following technical stack: reactJS (latest version) with typescript, and tailwind for styling.
The game is a replica of an old french web game developed in silverlight called Furukoo (maybe you’ll find some information on it).
For now the game should not store anything, and be played by both players on the same machine, we’ll improve that later.

The board consists of 6 vertical columns of 7 slots, and 6 horizontal lines of 7 slots, that create 25 closed squares and some more not fully closed. Please find attached a screenshot of the complete game layout. 
Vertical lines should have labels 1V to 6V on the top, horizontal lines should have labels from 1H to 6H on the left. On hover slots should have as title their line and slot number (1 to 7), examples: 1V1 and 1H1 for the two on the top left, 6H7 and 6V7 for the two on the bottom right. 

It’s a 2-player game, where each player (red, then black) can one after the other place one of their 7 colored pieces in any non-occupied slot. Once both players have placed all their pieces, they can more existing ones. They can move a piece by clicking on it (it then becomes yellow/orange) and then on legal slot move (slots highlighted in green). Valid slots are non-occupied and directly adjacent. Assuming there’s no piece blocking, each has 8 possible moves: slide up, slide down, slide left, slide right, pivot left down, pivot left up, pivot right down, pivot right up. 

To win the game, a player has to manage to complete a square with 4 of its pieces. 

Games are timed, each player has up to 5 minutes (when it’s his turn to play, like in chess), and 3 seconds are added to a player after each of his moves.

The full layout is as follows:
- A row at the very top with the configuration:
    - 2 user names inputs to configure the player names (defaulted to Player 1 and Player 2)
- A row with 5 buttons:
    - 4 buttons to navigate through the previous moves of the game:
        - go back to the very first move 
        - go back a move (if possible)
        - go to the next move (if possible)
        - go to the current move
    - 1 button to Resign
- A row with 3 readonly inputs for the first RED player
    - Name of the player (highlighted in cyan when it’s his turn to play)
    - Number of the move (starting at 0, then 1 on the first) with 3 digits format (eg. 001) followed by the old and new position of the piece (eg. “1V4-2V4”, V for vertical and H for horizontal: in that case piece was moved from the 1st vertical line from the left 4th slot from the top, to the 2nd line 4th slot). If the piece if placed (one of first 7 moves) and not moved, the first 3 digits should be 000.
    - The time remaining (under HH:MM:SS format)
- The board
- A last row with the inputs for the second BLACK player
```
```
I have a blank screen and "Uncaught SyntaxError: The requested module '/src/types.ts' does not provide an export named 'BoardState' (at gameLogic.ts:1:26)" in the console
```
```
Thats great! Just a few changes:
- The Furukoo logo on top should be in light purple/pink color, in arabic style letters, and the top bar of the F should continue above the "u" "r" and "u" until it hits the “k”.
- The full game (including everything, logo, buttons, board and 2 player bars with time etc) should fit on a regular screen like mine (from a 13 inch 2020 M1 macbook pro) without having to zoom out or scroll.
- In the 2nd readonly input of each player, containing the time: there should be a dot after the move number, and if it's a piece is placed and not moved it should add "000-" before the position. Complete example for a first piece: “001. 000-3V2”.
- The board background should be slightly rounded, like the inputs are.
- The horizontal labels should be very close to the grid (like the verticals one are) and aligned with the center of the slots, they’re currently a bit too high (vertical ones are good).
- The game should have a light mode, in addition to the current dark mode with a toggle on the very top right, and be in light mode by default.
- The color circle for the black player in the configuration input in not dark enough, and is different from the color of the black piece in the game (and the color of the black circle in the readonly input in the player's row).
- Would be nice if the instruction text (eg. "Player 1: place piece 2 of 7") was the last element, under the 2nd/black player's row.
- Each piece should have 8 legal moves, not 6. Both vertical and horizontal pieces and slide up/down and left/right, plus the 4 pivots.
- Once a piece is selected for a move, it should be possible to click on it again to cancel the move, in order to be able to select another piece to move.
- Pieces should not be circles, but rounded rectangles with a 4:1 ratio, horizontal ones should be horizontal, and vertical vertical obviously.

Before that, could you do a git init and add/commit the current version (before the requested changes). 
And then do each change one by one with a commit for each, with a nice and short commit message (keep it under 15 words and feel free to start the message with an emoji related to the change).
```
```
Other set of changes (keep the same commit rules as before):
- When no moves were made yet, it should still display the number (001.) and instead of the positions seven dashes (-) (eg. “001. -------“).
- The player boxes containing name/moves/time should be of fixed size so the board doesn't move because of the border when it's the other player's turn.
- When moving pieces, after selecting a piece, clicking on another one should cancel the current options and display new ones, without having to reclick the selected one first.
- The night mode switch should be an actual switch toggle, and the moon icon should be dark.
- After all the board should have no background at all.
- I’m not a huge fan of the Furukoo icon created, please create a more modern version of the old logo I attached (the only attachement).
- There should be a bit of margin under the logo, before the action buttons.
- Please use the F letter of this new logo as favicon, and put “Furukoo” with an uppercase as page title.
- On the board, only the slots should be visible, no grid behind it. Also these slots should be larger and almost touch each other (while keeping a 1:4 ratio approximately), the space in between should approximately of equal to the height of horizontal slots. Also the slots (when there's no pieces inside) should be less dark. Finally, slots should not change in size (height or width) when they get colored with a piece. 
- It would be nice if the slots and pieces could have a discreet gradient and be a bit white in the center for colored pieces, and a bit grayer in the center for the light empty slots.
```
```
- Can I get the player boxes with border-1 (instead of 2) but opacity-60 (instead of 70) for the inactive one.
- You can accentuate the white gradient on slots/pieces slightly more, don’t forget that for light/empty slots the center should be darker not whiter.
- The labels (both H and V) are partially hidden now that slots are larger, please fix it so they're fully visible. Also the bottom and right of the grid is slightly cut, it should be fully visible.
- The 4 replay buttons and resign/new game buttons should have the same height, use the average of both, in other words make the replay one a bit smaller, and the others a bit more height.
- The title logo should not be as dark, be a bit more transparent, and if possible make the font even more arabic style, not just cursive.
- The favicon is just a F in a totally different font, please use the exact same F as the new logo.
```
```
- Gradients are too visible now, black is ok, but red is too white, and the clear/empty slots are way too dark.
```
```
- Dark and red are perfect, but the empty slots are still way too dark and the gradient is barely visible.
```
```
- Gradient still too dark for empty slots.
```
```
Let’s now make the game multiplayer. Let’s create a small node.js backend (that will at some point run on a VPS, but for now run it locally), that connects to a mongoDB database to store games.
The home page should now be a login page, where user can create an account and then connect.
Once connected they appear in the top right section (cf. the layout image attached) that is a table, with their name in the “User Name” column, along side their ELO in the “Rate” column, and if they are in a game or not in the “Game” column (each game will generate a random color and the game cell will contain a circle of that color).
Under that table, still on the right section, is a chat where player can send messages, the “system” also print messages like "System : Yvan just connected” or "System : Yvan just created a new game”.
To create a game the user has to click the “Play” button at the very top next to “Connection” once he’s connected. He’ll then appear in the bottom right table, where game proposals are listed in an ELO Range, from top to bottom: 2400-3000, 2200-2399, 2000-2199, 1800-1999, 1600-1799, 1400-1599, 1200-1399, 1000-1199. The “Play” button becomes “Remove” and the user can click on it to remove his game proposal (if it was not accepted yet). 
When another player (connected too) clicks his proposal, they’ll get matched together and sent to the existing game page.
The game page should now have the same panel on the right with the table (containing all connected players in gray, but the 2 playing ones at the top in black), their rate and game (please factorise the code with the panel form the home page), and the chat.
In the chat it should tell each player how many ELO he’ll gain or lose, if the wins, draws, or loses.
Please create a basic elo system from this example: for two players with A 1945 and B 1560, A should get +6 if victory, -24 if draw, -54 if loss.
When the game is over they are sent back to the homepage and can create a new game proposal to play again.
Fell free to develop one feature after the other and commit them individually like before.
```
```
I get from the UI: Failed to execute 'json' on 'Response': Unexpected end of JSON input
Server seems to return 500 Internal Server Errors

where should I configure the mongodb credentials etc?
is there something else I need to do before being able to play?
```
```
I don't want to start mongodb locally, I already have a server set up, please use it.
Address: <redacted>, port: <redacted>, database: <redacted>, username: <redacted>, password: <redacted>, auth method: <redacted>
```
```
Some layout feedbacks: 
In the main page (lobby), can you put the logo a bit more on the left, there’s too much spacing. And the name and ELO of the connected player should be on the right just before the Play button. Also the header could have 40% less height.

On the right, the connected players list and chat should be 2 different boxes, taking each approximately half of the height. 
The Rate and Game columns should have a bit more space, they are too packed on the right.
The chat box should have a header “Chat” with the same style as the other boxes.
Users should be able to adjust the size of both boxes by moving a separator between the two.

On the left, above the ELO Range/Waiting players table should be another box with a nice explanation of the game and rules, don’t hesitate to add pictures and/or emojis, and make something nice.
A movable separator between the rules and ELO range boxes would be great.
And also a vertical separator between these 2 boxes and the 2 on the right. By default the left part should take around 66% of the space.

On the game page, same for the header height, same for the logo - more on the left, and same for the text (eg. “player vs player”) next to the Resign button. The connected users and chat should also be 2 different boxes (reuse the same component). The grid should take 66% of the width.

It’s too bad that the 4 buttons we used to have to see what happened before were removed, a player should be able to check past moves (maybe the go to last move button could pulse when its his turn to play).

When joining the game the potential ELO changes (in case of victory/draw/loss) should be written in the chat (display for each user his own values).
```
```
It seems that most of the times, there's an issue and one of the players (usually the one that made the game proposal) is not teleported to the game, only the player that accepted it is sent to the game.
End even when joining the URL of the game (shared by the player that was sent in game), the other is stuck on a screen saying "Connecting to game…". 
Any player should be able to reconnect if he leaves for less than 60 seconds, the other player (still in game) should see a countdown (in addition to the main time counter, not paused during the leave).
Don't forget to commit before/after each main change (as we did in the past, you did not do it last time).
```
```
So now both players are sent to the game, and the disconnect timeout works, but there's still an issue: players cannot rejoin using the link - they still get "Connecting to game…" indefinitely
```
```
Still getting Connecting to game… when re-joining localhost:5174/game/4ylsy0p28
```
```
Works great but it now seems the 5:00 counter is reset when the opponent leaves and rejoins
```
```
-A banner should be displayed when clients are unable to reach the server (during a game or in the lobby). 
-And all games, including moves and time left, should be stored in database.
-That way, if the server has an issue (restarts) during a game, players should be able to resume where they left off.
While both players are disconnected, even if the server is back up, the game should be held indefinitely until one of the player rejoins, after what the 1 minute timer of the other player not being there resumes.
-Also, it should be easy for players to rejoin, even without knowing the exact URL, the Play button should say Rejoin and be of another color.
As usual, do each feature one by one and commit it with a nice/short commit message starting with a related emoji.
```
```
- There should be a small wait before displaying the "disconnected banner", so it's not displayed for a few ms when people refresh the page.
- When players are in the lobby, the "In" column should display a light grey circle (with "Lobby" title on hover), and in games the title should be “Playing <id of the game>”.
- When the game is over but players did not come back to the lobby yet, the colored circle should have an opacity of 0.5, and say “Spectating <id of the game>”.
- Other players (from the 2 playing) should be able to join a game as spectator by clicking the game colored circle. They should not be able to perform any action apart from replaying the game locally (using the 4 buttons) and sending chat message (that would appear in grey, not black). And would also be marked as “Spectating <id of the game>”.
```
```
Even if the game is over, people should be able to spectate/come back to see what happened.
```
```
The game chat should be stored in database too and retrieved with the game on restart.
```
```
A few things to change/improve:
- The game chat content should be the same for everyone after all (so it can be retrieved), so it should display 2 lines for what each player would gain in case of win/draw/loss.
- The lobby chat should be stored in chat table in database (just for monitoring purposes for now).
- When spectating, there should not be a "Resign button" but the return to lobby one, and the text should say for example “Spectating <player1> vs <player2>” to make it clear. Playing players should see “Playing against <opponent name>”.
- The game page should be 66% board (or empty space around if it's too large and will cause scrolling) and only 33% players box/chat box.
- The SVG of the logo should not have that much space on the left and right, so the text of the logo starts without that big of a space on pages. When clicking on the logo, it should send back to the lobby.
- The scrollbars should be a bit larger (+50%) and with a lighter background (the color when moving is perfect, don’t touch it).
- The vertical one is bugged and tiny, it should take the full height of the set of boxes on the left and right. Also it should touch both sides without space in between. It should also be present on the game page (without necessarily touching the board).
- In game no need to display the ELO changes bellow the board, they are already in the chat. And the 4 action buttons should be center below the board, not on the left.
- The game rules on the lobby page are retarded, “complete more squares”, no, the first one to complete one wins, it’s impossible to do more than one. Please redo this section completely, with less text and much shorter, and include an image or web component of what the board looks like.
- The create account section on the login page would benefit from a email address field (stored in db too of course), and of a very simple home made captcha to prevent basic spam. The night mode toggle should also be present on the login page, just like on all others.

And then do each change one by one with a commit for each, with a nice and short commit message (keep it under 15 words and feel free to start the message with an emoji related to the change).
```
```
A few issues:
- The ELO changes are no longer printed in the chat, when the game is created it should say for each player how much a win/draw/loss would do to them.
- When a player (that participated in the game) leaves after it is ended, and rejoin as a spectator, he sees a “Resign” button… it should say the Spectating line and have the return to lobby button.
- The horizontal resize bar are much worse, please rollback this. And then just increase a bit the height of the previous ones (while keeping the trait “-“ in the center so people understand they can drag it). 
- The vertical resize bar from the lobby is just gone wtf, please readd it to, and make it take the full height. It’s also missing to the game page.
- What the fuck are these new game rules "placing one of your 9 pieces" there’s 7 how can you not know that? Please make an effort and remind the very first instructions I gave you. Analyse the code of the game if you have to. And what is this SVG… make a real replica of the board (cf. screenshot in attachements)
- In the login page, while registering, the email should not be optional.
```
```
Please take a moment to do a full code cleaning, to factorize common values and strings like colors, remove duplicated code, or dead/unused code. Also think about if everything is good on a security standpoint.
```
```
The vertical resize bar still doesn’t take the full height.
```
```
Cf. screenshot attached, there should not be space (hashed in red) between boxes and resize bar, and the bar should not go higher/lower than the boxes (crossed in blue) - same for the left/right that we can't see on the screen
```
```
there's still space left and right of the vertical resize bar
```
```
can you make all resize bars backgrounds lighter? just a bit darker than the regular background color
```
```
- If a player has a proposal pending but accept a game, it should be canceled when the game start and not be there when he comes back. In general make it so when a game starts both players get their proposal removed. It’s ok for a player to join as a spectator without removing it’s proposal.

- When the game is over, it should say "Reviewing" instead of "Spectating", next to the "Back to lobby" button but also on the color circle hover, and for all players regardless of if they were part of the game or not.

- If a player connects a second time (from a second browser) he should be disconnected from the first one.

- At the end of the rules, please add messages like “Invitez vous amis” (french) or “Kutsu ystäväsi” (finnish) in all 15 major languages. Each message should be separated by an owl face icon, and they should rotate like a carousel but continuously.
```
```
-The circle title (in the players list) still says Spectating instead of Reviewing when the game is over.
-Can you also put a crown emoji next to the players name in his readonly input when the game is over.

-If a player connects a second time (from a second browser) I meant it should be clear for  the first one that he's disconnected (alert banner or forced log out/back to login page).

-For the "Invitez vos amis" message, it moves too fast please slow it down. Also make french and english message 3times more likely to appear. Also, please use only the face of the own as emoji (cf. original image attached even if the resolution is not great)
```
```
The login page should have an option (below the existing login/register box) to Play as guest (it should warn that ELO will not be saved and players won’t be able to reuse the temporary account). And it should generate a user with a random complex password, no email, and as user Guest000000 (replace 0 by a random 0-9 number). 
```
```
No need to display "(Guest + 6 random digits)" on the page lol
```
```
I changed my mind, there should not be a chat specific to the game (please do the required cleaning), only the global lobby chat shared by everyone. However please adapt the model to store the “origin” of the message (lobby or game id), and add a toggle (disabled by default) in the lobby and chat to see only the content from this specific place.

The chat the user can see should never be cleared, even when he goes back to the lobby after a game.

When a player joins or leave/rejoin, he should see all the content from the last 60 seconds.

Also let’s change/add text in the chat:
- When a player proposes a game, write “System: <player> just proposed a game” (change) (origin: lobby)
- If he removes it, write “System: <player> removed its game proposal” (add) (origin: lobby)
- When a player accepts a proposal, write "System: <player> accepts <other player>'s game" (add) (origin: lobby)
- When players join, write for each (when HE connects) "System: <player> just joined game <game id>" (add) (origin: game id)
- When the game starts, write for each “System: <player> - victory +X / draw +Y / loss -Z” (change, use victory not win, replace X Y Z by the actual values) (origin: game id)
- On win, write “System: <player> wins (on time)!” or other reasons (just an example) (change) (origin: game id)
- Don’t write ELO changes in the chat on finish (eg. test: -29 ELO → 1163) (remove)
```
```
Don't forget to, as always (please remember) commit with a nice and short commit message (keep it under 15 words and feel free to start the message with an emoji related to the change).
```
```
The tooltip (on colored circle hover in the player’s tap) should appear instantly without waiting a few secs (please use a library for that no the default title). 
Please complete the rules that it’s clear that people can do that (spectate live games).
After the rules, before the movies multi langue messages, please add credits: Jean François Loiseleux (original board game), @Navedac (original web game). And add that this game was coded with <3 by Claude Code for iNo_.
```
```
Can you put the credits on a single line, something like "Coded with ♥ by iNo_ & Claude - Original game by Jean François Loiseleux & @Navedac"
```
```
Can you replace the board svg in "how to play" by this image
```
```
Can you add a Profile page, accessible by clicking the username in the header.
It should contain 4 sections:

A “Me” section with 4 boxes (on the same row):
- Current ELO
- Number of games played
- Number of minutes played
- Join date
Each box should contain 3 lines: an icon representing the title, the value (in bigger chars/black vs the rest in gray), the title of the box.

A leaderboard section, with a table that should display the best players by ELO, with their ELO and number of games played.
- the top 5, a separation, the 2 players before the user, the user, and the 2 players after the user, for a total of 10. (if he’s not part of the top 8)
- the top 10 players including the user (if he’s part of the top 8)
The top 3 should have gold/silver/bronze medals icon then a count.
It should be possible to click a player’s name to see his profile page.

The user’s ELO history graph, with the highest ELO per day, from the creation date of the account until now or maximum 1 year.

A “Games” section with 4 boxes (same row again):
- Game with the least number of moves
- Game with the highest number of moves
- Shortest game in time
- Longest game in time
It should be possible to review these matches.
Each box should have the same 3 lines as above.

A Games history section, with a table with a pagination of 10, displaying the latest games (full history of games, the last one being first).
The following info should appear: 
-most important: opponent, victory/draw/loss, number of ELO gained/lost, ELO after the game, date/time of the game
-nice to have (not as important): number of pieces moved for each player, duration of the game
It should also be possible to click a player’s name to see his profile page.

Don’t hesitate to commit feature by feature.
```
```
-Reorder the sections to have: Stats, Games history, Records, Elo history, leaderboard
-Remove "Member since May 5, 2026" under the name as the exact same info is already in a box
-in the Games history table it's not obvious that we have to click the date to review the game, can add a column at the end Review, and eye icons to click to review
-Make it more obvious that we can click our on name in the header to access this page, name transform name(+elo) as a button grey.
-Unrelated to the profile page, in the chats, please make the filter buttons actual switch toggles and write "lobby chat only" or "game chat only" (disabled by default)
```
```
Can you make a version of the website for mobile phones or small screens, where all the sections are one under the other (lobby: waiting,  chat, players, rules) (game: board, chat, players). It must feel it was really thought for mobile first. The current desktop layout should not change at all.
As usual, commit step by step.
```
```
On mobile on the profile page, boxes should be 2 by 2. 
Please also make the history table fit on the screen, maybe hide the After/Moves/Duration columns.
```
```
Now let’s add the option to play against the machine, please create a fake player called “Machine” (that will have a real account and ELO) that will be used as bot and will continuously offer games when he’s done with the previous (though he can only play one game at once).
He should try to make a square without ever making errors, and think ahead to prevent the other player from forming his square. He should think at least 3 moves in advance and compute possibilities not to be surprised by an opponent move.
As a reminder the board consists of 6 vertical columns of 7 slots, and 6 horizontal lines of 7 slots, that create 25 closed squares and some more not fully closed. The goal of the game is to place 7 pieces each one after the other, and then move them to the 8 closest slots (if available). Assuming there’s no piece blocking, each has 8 possible moves: slide up, slide down, slide left, slide right, pivot left down, pivot left up, pivot right down, pivot right up. 
Each player has a total of 5 minutes (+3 seconds per move).
Feel free to use genetic algorithm to get a program with a great level, and make versions of the program play against each other to select the best ones every generation.
It would be great if we could later on “dumb it down” to have different levels of play, but for now focus on getting the best level possible. One option will be for instance to increase the time the machine takes to play (with some randomness always).
As always, commit step by step.
```
```
Let’s add a missing rule: just like in chess, a threefold position must cause a draw. Please update all the website to take Draw as an option.
Please update the bot “Machine” behavior to avoid draws as much as loses (in its head a draw should be just like a loss, and it should avoid it at all costs).
```
```
Just like we have the “Machine” bot, that’s as powerful as possible, please add a 2nd bot called “Automaton”, that’s a 5 on score form 1 to 10 (current level). Please have in mind that we’ll late add a feature to add more bots with different levels from 1 to 10, there won’t be only 2.
```
```
Please create an admin panel, visible only by admins (property in the database model, only give it to player “<redacted>” for now) that will have two sections:
- bots handling: table of all the bots (paginated to 10), with of each toggle switch to enable/disable them (should finish its game but not propose any new ones if disabled), and rename option (the robot emoji that’s currently displayed next to the Machine name should be part of the name so we can choose to display it or not). Its level (from 1 - tries to do a square but doesn’t think more than 2 steps ahead to 10 - highest level as possible) should also be configurable. And we should be able to create new ones from here.
- players handling: table of all the actual players (paginated to 10), with flag admin or not and option to click it to give them the rights, flag muted  or not and option to mute (should prevent them from writing in the chat), flag banned or not and option to ban (should disconnect them if they are connected and prevent form login again). Each player line should contain also some data: date joined, current ELO, number of games played, number of messages sent
```
```
A few things to fix/improve:

- There’s a small bug, when we’re in the lobby and go to a player profile then come back using the back button, there’s then no players/game proposals displayed, and we have to refresh the page to see them. It should refresh automatically when we come back.

- I saw that you added a link to the profile page of the player in the message “Playing against <player>” in the header in a game, no need to do that please remove it. But, in the connected players tables (both lobby and game) add that link in the players name.

- In the player profile, could you replace the date joined box by number of messages sent. And add the join date “member since” under the username at the top of the page.

- The games instructions are quite bad (like why would be want to specify "not on the dots" when there’s not even dots on the board). Based on the rules that you just had to create the best machine/bot possible, please rewrite the instructions simply and in a nice way for users to want to play the game. There should be at lest 40% less text than currently.

- Can you make it so that regardless of the screen size, when zoom is 100% (normal), in the lobby page, the 2 boxes (How to play & Waiting, or Players & Chat) take 100% of the available height. How to play should take 65% & Waiting 35%, and Players & Chat both 50%. Same for the game page for Players/Chat, and board as big as possible while being completely visible without scroll, centered on the screen left (not including players/chat).

As usual, one commit per feature please.
```
```
- The credits and “Invite your friends” should be at the bottom of the How to play section.

- In the admin page, as we can add new bots, we should be able to fully delete them (after a confirmation modal).

- In the admin page no need for the Admin badge/button in the header.

- When a player is muted he should be aware, the message... input should be disabled/readonly and say Message... (unaccessible as muted) or something like that.

- When a player is banned he should be notified when he’s disconnected, just like the banner that appears when he’s disconnected because he connected from another browser.

- No need to display "Lv5" or any level next to the bot's name, the ELO they will soon have will speak for itself.

- In the players tab, no need to add “- click to spectate” after “Playing <game id>. Not sure when that was added and why.

- On desktop on the game page, the input row (name, plays, time) of each player should take only the width required, and be centered. The board should be a bit smaller. And there should be some margin between the input rows and the board. 
Also, the win/loss/draw message on game end should only be in the board section, not above the players/chat on the right.

- Please review the mobile version as, in the lobby:
-Waiting should show all the games available (and keep the ELO ranges that we have for desktop), currently we barely see the first one and can't even scroll. The players (connected) tab should take the min required height to fit them all. How to play should not be cut and when open should display everything if we scroll the main page.
-On game, the chat and players section are all tiny we can't see anything. Plus there seems to be an issue with the board pieces, they are not colored inside there's only the borders visible.
Once again those fixes are for the mobile version only, make sure not to impact the desktop version.
```
```
Please fix the previous git commit messages that do not start with an emoji and uppercase, so every single one of them starts with an emoji related to the message, and starts with an uppercase. Don’t touch the existing message apart from emoji + uppercase. Make sure that the time of the commit does not change, and keeps the original time and is not reset to now.
```
```
please make sure that I can push the code to github as open source without any secrets leak, personal info, or vulnerability that could be exploted
```
```
Can you update the readme with everything interesting that other game/site readmes have
```