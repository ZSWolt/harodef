# Test scenarios

| # | Goal | Starting state | Role | Steps | Expected result |
|---|---|---|---|---|---|
| 1 | Open a lobby | Home screen | Host | Enter a name → open lobby → allow microphone | 4-letter code, 1/8 players, Start disabled |
| 2 | Microphone refused | Home screen | Any | Block microphone | "Microphone needed" screen with a retry button |
| 3 | Join with a code | Lobby open | Player | Enter the code → join | Shows up on the host's lobby within 2 seconds, and they can hear each other |
| 4 | Wrong code | Home screen | Player | Code that doesn't exist | Message "We couldn't find a lobby with this code" |
| 5 | Start | 8 players | Host | Start | Chaser drawn + order shown, then a qualifying round |
| 6 | Qualify by voice | Qualifying round | Contestant | Say the answer | +5 / ✗ and a new question, "אממ" is ignored |
| 7 | Eliminated | Under 40 at the end of the time | Contestant | Wait for 0 | "Eliminated" screen, the next contestant comes up |
| 8 | Choose square 3 | 40+ points | Contestant | Square 3 | +10 points, token on 3 |
| 9 | Muting in the chase | Chase question | Chaser/contestant/spectator | Talk | The chaser and contestant don't hear each other, the spectator hears both |
| 10 | Caught | Chaser one square away | Both | Chaser right, contestant wrong | "Caught!" + sound, next contestant |
| 11 | Escaped | Contestant on 7 | Contestant | Right | "Escaped!", status escaped |
| 12 | Chaser wins | Nobody escaped | Everyone | End of game | Final screen "The chaser" |
| 13 | Player disconnects | Contestant on stage | Contestant | Close the tab | Skipped after about 12 seconds |
| 14 | Host disconnects | Any | Player | Host closes the tab | "Connection lost" screen |
