# Atlas Minor (prototype)

Scan a real object, and a tiny world grows on its **actual** surface. Its bumps become
mountains, contour lines plot themselves in like a pen plotter, and you can push the
terrain around with your finger.

The rule the code sticks to: **terrain always comes from the scanned geometry**. Nothing
recognises "this is an orange" and swaps in a library mesh.

## The look

The look follows **[STYLE.md](STYLE.md)**. The world is a survey sheet of about 1780–1850, and the atlas a star atlas of the same years. Every new mark has to pass one test: would a surveyor of about 1820 have drawn it this way?

* **Purely ink, purely flat.** Everything lies on the ground, drawn from above. Nothing stands up off the world.
* **Development as light.** The simulation still grows streets, houses, farms and markets underneath, but the map draws only their light, as the Earth is seen at night from space. Every house is a small light (old cores brightest, farms faint). Roads are threads of light, and it spreads and fades over the ground. It is drawn in ink as stipple: nearly solid at the cores, thinning to a halo, to specks. No buildings, outlines, walls or traffic on land (`src/life/development.ts`).
* **Organic growth.** Places grow as real settlement does seen from high up (`GROW` in `src/life/settlements.ts`). Sizes are unequal, since growth rises with size and each place has its own vigour. Edges are ragged and fingered, and growth runs along roads and the water. A grown place buds villages along its ways, and farms gather in hamlets. The field cells are never outlined, so no pattern shows through. (The tests of streets and squares use the compact model with `organic` off.)
* **Only the terrain is plotted.** The pen draws the contours; everything that lives on the land fades in by itself as it grows.
* **Fading ink.** The terrain's ink out of sight fades slowly back to pencil (held 25 s, then over 45 s), never further. When it turns back into view and the world is at rest, the pen comes and inks it again. After whatwesaved's fading plate: the pen is the only light on the sheet.
* **You can't come close.** Zoom stops well short of seeing what anything is. You see how much, where and how it spreads; the rest is for the imagination.

## Your universe is kept

Every world you make, what grew on it, the railways between worlds, which way each world was turned and which one you were on are kept on your device (the browser's own database, offline). Opening the app again brings it all back as you left it (`src/save.ts`).

* **What's kept is small.** A specimen is kept by its name, since it is made the same way every time. A scan keeps its own geometry. Then the ground's edits and the simulation's own state; heights, water and the drawing are worked out again.
* **When:** every 8 seconds if anything changed, and whenever the page is hidden (switching apps, locking the phone).
* **Starting over:** open the cabinet (tap the paper round the world) and tap *Begin a new atlas* twice.
* **Not kept:** a scan's photo texture. Its vertex colours are kept, and the paper look uses only a little of either.

## Volcano (a prototype beside it)

**On an iPhone:** the game is also a native iOS app (Capacitor, in `ios/`), with the phone's own haptics and share sheet. See [IOS.md](IOS.md) for running it from Xcode, TestFlight and the App Store.

`volcano.html` (`src/volcano/`) is a separate prototype, and Atlas Minor is untouched by it. You are the heat beneath a world, and there are worlds in sequence (`worlds.ts`). Each has the same single control and its own physics, aim and colours, as each has its own kind of volcanism:

| | World | What's different | The aim |
| --- | --- | --- | --- |
| I | **An ocean world** | Sea, life and reefs. The crust drifts over the heat and carries it round the world, so a chain of islands is left behind, as over a real hotspot. On screen the vent stays put and the world slides past beneath it. The heat rises evenly, so the last stretches get as much as the first. | **Ring the world:** carry a chain of living islands all the way round before the fire goes out (`chain.ts`). The way is 16 stretches; a stretch is held while something lives on or by it, land or reef. Old islands sink and wear, and unless reef holds them they drop out. |
| II | **The Moon** | No air, no water, no drift, no life, and stones falling all the while. Lava as thin as water, which floods low ground instead of building mountains. The heat rises to whatever you turn uppermost. | **Flood the seas:** fill each of the four great basins (70% of its floor) before the heat is gone. Flooded ground stays dark, as the Moon's seas are. |
| III | **Mars** | No drift, so the heat stays in one place and the mountain rises over it, and the heat rises evenly rather than fast at first, so the mountain has to be built all game; weak gravity, so slopes stand steep. Thin air: dust storms, seen rising first, scour the heights, soft ash most. Craters, and a stone now and then. | **Raise the great mountain:** stand the summit 28 km above the plain. A dotted ring round the heat is inked round as it rises, and its height is told at the foot each time it stands two km higher. Cover soft ash with lava before a storm comes. |
| IV | **An ice moon** | Water is the lava and ice the rock: no sea, no life, craters on old grey ice. Water runs thin and freezes fast; bursts throw frost far. The heat rises to whatever you turn uppermost, as on the Moon. | **Make the ice new:** cover 35% of the surface with fresh ice or frost, which stays white against the old grey. A dotted ring round the heat is inked round as the new ice spreads, and the share is told at the foot every 5%. |
| V | **Io** | A moon kneaded by its giant planet, so its heat comes in tides, round once every 50 seconds: slow, then fast, then slow again. No craters (it is always being resurfaced), no air: a burst's sulphur flies out and falls in a ring, as Pele's does, drawn in a clean-edged red band. A burst at high tide throws as if it were 70% bigger; at low tide it fizzles. | **Great plumes:** raise 8 great plumes, each at least 0.5 rad from the others. The dark smoke column means a burst now would be great, which the tide decides as much as the pressure. A dotted ring round each counted plume marks the ground it has taken, doubled while the heat is inside one. |
| VI | **Enceladus** | A small ice moon of a ringed giant, which hangs in its sky (upper left, engraved, its ring in dots). The heat stays at one place. A burst tipped towards the giant (within 0.7 rad, along the ground) sends 80% of itself into the giant's ring; tipped any other way, it falls back as frost. The ring thins away at 0.3% a second unless it's fed. | **Fill the ring:** have it hold 100 at once. Its dots ink round as it fills and fade back as it thins. While the world is tipped the giant's way, its ring's empty dots darken, so you can see you're aimed before the burst goes. |
| VII | **A lumpy asteroid** | Broad lumps and hollows, and one great crater (as Vesta's south pole has), on a world not yet pulled round. On so small a body, down is towards its own middle: lava runs by the asteroid's own slopes wherever it comes out (`selfGravity`), and the way it's held only matters for where the heat goes and when it pours. | **Make it round:** fill the hollows until the asteroid is 45% rounder (its spread of heights from round 45% less than it began). Its deepest hollows are stippled in pencil, as old charts stippled a depression, and fade as they fill; a ring round the heat inks round as it rounds. |
| VIII | **A spinning world** | Spun so fast it bulges at its middle, as Haumea does: the equator starts higher, and lava is flung towards it whatever the ground's slope (an outward pull from the spin's axis, added to which way is down). | **A ridge all the way round**, as Iapetus has: the dotted equator is 16 stretches, each inked once the ground along it stands 0.115 higher than it began. |
| IX | **A lava-lamp world** | Glass, and hot rock lighter than the deep. Nothing flows. Held level, a glowing blob buds at the heat and grows; tipped, it lets go. Hot blobs float to whatever is uppermost and cool as they go; cold ones sink back, and near the heat they warm again. Big blobs move slower but cool slower; two hot ones that touch run together. Held too long, a bud bursts into small blobs. Drawn as metaballs on a shell over the glass, so blobs neck and join as a lamp's wax does, with a clean edge. | **Fill the far shore:** bring blobs, still warm, to the dotted shore two radians round the world (140 of blob). It's drawn as a pool there, growing as it fills. |
| X | **A tumbling moon** | As Hyperion tumbles: its spin wanders and grows back of itself (to 0.3 rad a second, its axis drifting), so the world rolls on its own, the heat creeps to whatever is uppermost and pours break out wherever it tips. Every eruption pushes against the spin where it breaks out, taking away part of the spin across the vent (up to 0.45 at once), most on the tumble's equator and little towards its poles. A dotted ring marks the tumble's equator, wandering with it. | **Calm the tumbling** to 75% and hold it there for 20 seconds. |
| XI | **A deep ocean world** | Lava sets fast in the cold deep. But lava running over crust it laid in the last moments stays hot inside it, as in a tube, and runs on far, so tipping the same way again and again builds a long tube out. | **Build out to the dotted bank** (0.6 rad from the heat) **and raise an island there**, above the sea. |
| XII | **A young Earth** | Hot, cratered, no moon yet. The cone holds the pressure down: what bursts out on its own rises with the height of the ground round the vent. A burst bigger than the usual burst size throws 60% of the excess clear of the world into orbit; held too long, the cone blows apart and throws nothing. | **Make a moon:** throw up enough rock. The moon to be is a ring of dots in the sky round the world (not on it, so it stays put as the world turns), inked as rock reaches it. In the long age the rock gathers into a small engraved moon beside the world; not met, it falls back. |

The aim is drawn on the map in small dots, as a chart marks a route or a boundary: pale where it's still to do, inked where it's done. A Moon basin's ring is inked round as its floor floods, like a gauge, and is whole once the basin is full. Dots rather than a line, so the route round the ocean world doesn't read as an equator; there, the stretch the heat is on and the next one are drawn a little stronger, so you always know where to build. The aim is also said in the quiet line at the foot once the world begins ("Keep building islands as the heat travels the dotted line. A gap breaks the chain"), again after three minutes with nothing gained, and each time something is ("6 of 16 stretches living"). Met, the world says so ("Done: living islands all the way round") and the chart is drawn. Once it's drawn, a touch goes on to the next world (turning the world all the way round still works too). Not met when the fire goes out, time passes, the chart says how far you got, and a touch tries again. The worlds' numerals sit along the foot of the start card, I · II · III, and touching one goes to that world; the same numerals sit faintly in the top-left corner while playing, and touching them goes back to the card, keeping the world to come back to. `?world=moon` also goes straight to one.

Each world lasts about eight to ten minutes. Headless balance, with simple bots, checked that every world can be won and that idle play can't win it. On the ocean world (about 9 minutes), with the heat rising fast at first, even the best bot held only 14 of 16 stretches: the heat ran low just as the route came round to its last stretches. With the heat rising evenly, a bot that bursts whenever it can rings the world at about 8 minutes; one that mixes pours and bursts holds 15; idle play holds 9. On the Moon (about 9 minutes), a bot that knew where every basin was flooded all four in about four minutes (with the heat creeping to a basin turned uppermost at 0.035 rad a second; at 0.02 even a perfect player managed only four of five). On Mars (about 8 minutes), idle play raised the summit to 19 km. Play that mixed pours and bursts reached 28 km at 6–7½ minutes from every starting point tried. (With the heat rising fast at first, as on the other worlds, bursting play had reached 26 km in under 3 minutes.) On the ice moon (about 9 minutes), idle play made 12% of the surface new. Play that wandered the heat about reached 23–34%. Play that moved the heat steadily one way, turning every minute and a half, and mixed pours with bursts reached 35% at 6½ minutes and 43% by the end. On Io (about 7½ minutes), a bot that held through the rising tide, burst just after its height and moved the heat at the ebb raised its 8th great plume at about 5 minutes. A bot that burst on raw pressure alone, whatever the tide, only just made 8 at the end. Bursting whenever possible made none, and idle play one (the last of the heat escaping). On a young Earth (about 7½ minutes), a bot that held each burst to 90% of what the cone could hold made the moon at about 6 minutes. A more cautious one, at 60%, made it at about 6⅓. Bursting at the usual burst size threw up only a seventh of a moon. Before the tide changed how far a burst throws, ignoring the tide had beaten timing it; the change is what makes the tide matter. On Enceladus (about 6½ minutes), a bot that tipped every burst straight at the giant filled the ring at about 3⅓ minutes. Aiming within about 23° either way, it filled at about 5 minutes. Aiming within 34° or worse, it never filled the ring (most 89 of 120), and nor did idle play. On the asteroid (about 7½ minutes), even pouring all the heat into the lowest places in perfect order could make the first version (lumpier, less heat) only 34% rounder, so its aim of 60% was out of reach; the bot managed 19%. With gentler lumps, more heat, the heat moving faster to the hollow you turn up, and lava running by the asteroid's own slopes, a bot that kept finding the nearest low place and pouring gently there was 41% rounder at 5 minutes, 44% at 5¾ and 46% at 6⅔. So the aim is 45%, met about three-quarters of the way through, and idle play makes it no rounder at all. Its twists were balanced the same way: a quick fire, a slow fire and tides get 13%, 20% and 10% more heat, and every pairing came within 0.05 of the asteroid's own pace. On the spinning world, the first spin barely moved lava (it piled in a dome at the vent), and with a first ridge of 0.03 a bot finished at 40% of the fire. Spun harder (2.5), lava visibly runs to the equator; with the ridge at 0.115, a bot that kept going to the least-raised stretch finished at 79% of the fire, and idle play raised 3 of 16. On the lava lamp, the first control (tipping pours, as everywhere) never let a bud go, since steering blobs means holding the world tipped; so the bud now grows while level and lets go when tipped. Blobs first cooled before crossing the two radians to the shore; at a speed of 0.07 and 45 seconds hot, a bot that grew buds beside each other at the heat until they merged big, then turned the shore up, filled the shore at about 80% of the fire, and idle play brought nothing. On the tumbling moon, the tumble first grew back too fast for anyone to hold it calm, and a lucky first burst could calm it outright; with the spin growing back at 0.0015 rad a second, each burst taking at most 0.45 and far less away from the tumble's equator, and the calm needing to hold 20 seconds, a bot that turned the spinning equator uppermost and burst as the ground swept past held it calm in 5 of 5 fires (42 s to 5½ minutes), one that burst whenever it could in 3 of 5, and idle play in none. On the deep ocean, lava first never reached the bank; with tubes carrying it on (0.02) and the bank at 0.6, a bot that poured the same way again and again raised the island at about 69% of the fire, and scattered or idle play raised none. Their twists were balanced as the others' (a quick fire, a restless sky and tides on the spinning world get 15%, 20% more and 12% less heat; thin lava there, a quick fire on the lamp, and twists that mean nothing on the lamp aren't dealt), each within 0.05.

**Free play.** Every world can be played without a clock: *free play: the heat never runs out* on the card. The heat never runs low, and meeting the aim is said ("Done: the ring is full. Play on as long as you like") rather than ending the fire. It goes on until you end it with *end the fire* at the top, and then the long age and the chart come as ever, the chart saying whether the aim was met. Free play keeps no best (it has no clock to be best against) and isn't offered for a world of a solar system. A world kept part-played remembers which way it was being played.

**A solar system** (`system.ts`, `systemChart.ts`). The worlds played as one run, for replay. From the card, *a solar system* opens its chart: a star and five kinds of world drawn from the seven, warmest nearest the star. Each has a twist that changes how it plays:
* *a restless sky*: stones fall twice as often;
* *a quick fire*: the heat comes a quarter faster (the same heat in all), and held too long it bursts out sooner;
* *a slow fire*: the heat comes slower, over a longer fire;
* *thin lava*: it runs far and sets late;
* *thick lava*: it piles up near the vent and sets soon;
* *a near neighbour*: tides, as on Io;
* or *as it is*, at most once.

**Balancing the twists.** Every pairing of a world and a twist was played by a bot that plays that world well, and its win (as a share of the fire) compared with the same bot on the world without a twist.
* The first twists were uneven. *Young and hot* (more heat) made every world easier by 6–13% of the fire. Thin and thick lava (flow speed alone) changed nothing anywhere: flow speed is never the limit. Tides made the ocean world unwinnable, since its heat must keep pace with the drift.
* So the heat twists became pace twists (the same heat, faster or slower). Thin and thick lava now change how soon lava sets as well as how fast it runs. Pairings that heat can't set right aren't dealt at all:
  * pace or tides on the ocean world;
  * a quick fire on Io, which leaves too few tides;
  * anything but a quick fire or thin lava on Enceladus, whose aiming they upset.
* Where a twist still tipped a world by 0.09–0.16 of the fire, its heat is set back by a measured factor (`BALANCE` in `system.ts`): ice with a slow or quick fire; Io with a slow fire or thin lava; Mars with thick or thin lava; and a young world with a slow fire. Rerun, each corrected pairing came within 0.03 of its world's own, and every pairing dealt is within about 0.08.
* Enceladus's bot aims with a random error, and identical runs ranged from winning at 78% of the fire to falling short at 87% of the ring. With the ring's aim at 100 (down from 120), it's about even for a player aiming within 23°, and easy for one who aims true.

The worlds are played once each, in whatever order you choose, on new ground. What a world makes, it passes on to the next one played:
* any world whose aim is met passes on up to 15% more heat, the more the better it did at its second aim;
* a small ice moon's ring falls on the next world as stones: more of them, and half as much heat again in each;
* a young world that makes its moon adds that moon to the system, as a world of its own to play. A volcano can't make a planet, but it can make a moon.

So the order is the strategy. When every world has been played, the system's chart goes into the atlas. Each world of a system says its place and kind ("III · A red world"), not its name in ours.

**Atolls.** On the ocean world the long age follows every fire, met or not (the world stands still for it). The islands sink much further than while the fire burns, and the reef's seaward edge, marked once as the age begins (living ground bordering water that holds nothing, three wide), keeps growing up with the sinking. Its rock is cemented and doesn't slump into the lagoon. Here and there along it, in clusters, coral sand builds islets just above the surface; between them the reef lies awash. The middle drowns into a lagoon. What's left is a ring of islets round a lagoon where each island stood, as Darwin explained atolls, and the chart counts them. The next fire on that world rises among them.

**Two aims that pull against each other.** Each world has a second aim beside the first, measured as the fire ends (`second.ts`), shown on the chart and in the atlas, with the best so far on each world under the card's words. The heat is finite, so they compete for it:

| World | First aim | Second aim | Why they pull apart |
| --- | --- | --- | --- |
| Ocean | ring the world | atolls: islands at least 30 vertices across when the fire ends | the crust keeps moving, so heat spent on a few big islands leaves gaps; a chain spread whole runs together into one |
| Moon | flood the basins | the share of lava kept in the basins | flooding fast spills; flooding neatly is slower |
| Mars | 28 km high | the base's width, 5 km up | a narrow peak rises fastest; a broad shield lasts through the storms |
| Ice moon | 35% new | the largest single sheet | new ice everywhere covers most; one sheet means staying |
| Io | 8 great plumes | the widest plume's ring, in km across | the widest needs the pressure held deep into the tide, near where the cone blows apart |
| Enceladus | the ring full | how much of the moon is frosted new | every burst aimed at the ring is frost the moon doesn't get |
| Asteroid | 45% rounder | the share of its new lava that lies in what were hollows | pouring fast, or bursting, spills lava over the lumps, which rounds it less |
| Spinning world | the ridge all round | the ridge's height | spread thin, the ring finishes fastest; a tall ridge asks you to stay |
| Lava lamp | the far shore filled | how much of the pool came in one blob | a great blob lasts the journey, but takes long to gather |
| Tumbling moon | calmed, and held | how still it's left as the fire ends | calming it past the aim means bursting just where the ground sweeps past |
| Deep ocean | an island at the bank | the tube's length, in km | one long straight tube is fastest; a winding one runs further |
| Young Earth | a moon | the moon's width in km (as much rock as the aim asks makes one as wide as ours) | bigger bursts throw more, but held too long the cone blows apart and throws nothing |

**Every world has a long age.** When the fire goes out, met or not, time runs on quickly for a while before the chart is drawn, and each world does its own thing with what was made: the ocean's islands sink into atolls; on the Moon and the ice moon small stones still fall and pock the new ground; on Mars the storms go on wearing the mountain; and the ice moon's new ice slowly greys. What the fire achieved is counted as the fire ends, so the long age can't undo it.

**The atlas.** Each chart, once drawn, is kept as a page (a small picture of the plate, and what it says) in IndexedDB, the last sixty. The start card shows "the atlas · N charts"; it opens as pages to leaf through, newest first, and one opened fills the screen. The plate is drawn with the world centred, whole.

**The card** says little, as calm games do: the world's numeral and name, one line of mood, one true fact about the world that explains its aim, and one line of what to do and what it does (`first`, `then`, `second` in `worlds.ts`). Play teaches the rest. Below: *voyage* (a run of worlds), *wander* (the fire never cools), *ink* (woodblock, watercolour, or the look before), and *the atlas*, whose finished worlds are *plates*.

**The first minute** is a few quiet lines at the foot, each said once when it's what matters next, on every world: hold the world level and the heat gathers; tip it and the lava pours; tip it when the smoke is heavy and it erupts; on the Moon and the ice moon, turn somewhere else to the top and the heat creeps there; on the ocean world, the six kinds of life; and, the first time a stone is coming, turn it to the top to catch its heat.

**Past fires become geology.** When a world's fire ends, the ground it left is kept (in localStorage, per world), and the next game on that world begins on it, with the new fire starting somewhere else. The ocean's old islands have sunk meanwhile, to seamounts and shoals that the next chain can build on. The Moon's old seas stay dark, a little faded, beside the new basins. Mars keeps its old mountains, cratered afresh, and only the mountain over the new fire counts toward the aim. The ice moon keeps its old new ice, faded. The start card says so, and offers to start the world on new ground instead; the chart counts the fires. `?seed=` always starts on new ground.

**The goal:** when the heat runs out, after about nine minutes, what your world keeps is **how many of six kinds of life** still live on it. Each kind needs its own ground, so no single way of playing makes them all:

| kind | needs | made by |
| --- | --- | --- |
| moss | bare new rock | anything |
| reef | shallows | gentle flows running into the sea |
| mangroves | a low, gentle shore | gentle flows |
| meadows | ground rich with ash | bursts (ash dusts the land round them) |
| forest | high ground | building up |
| heath | a high cone of ash | bursts |

In headless play-throughs, gentle flows alone kept 4 kinds, doing nothing kept 3, and mixing flows with bursts kept all 6.

**How to play: only by how you hold it.** There's no tapping and no holding, just the world held as a globe in the hands.
* **Tilt your phone**, or turn the world with a finger (on a keyboard, the arrow keys). The first touch, on a quiet card, begins the world. It's what lets the phone share how it's held (iPhones ask for motion access then). However you're holding the phone at that moment counts as level.
* **Held level**, the heat gathers beneath whatever is uppermost; **tipped**, it pours down the world the way gravity would take it. That's measured along gravity as the world is seen, with the relief as drawn: near the top the terrain decides, further round the curve of the world pulls the lava down its side, and it never runs up the screen.
* **Tip soon** for a gentle stream. **Hold it level until the smoke is heavy, then tip**, for a burst of ash. Level too long, and the mountain tears open into a caldera, and life dies far around it.
* **The heat is buoyant:** it creeps slowly towards whatever is uppermost, so you move it by turning a place to the top. The land it leaves behind cools and sinks.
* **Wishes:** now and then life wishes for a kind it lacks, shown by a dotted ring. Make that ground there and the wish is kept, which stirs the fire (more heat).
* **Stones** are seen 20 seconds ahead, marked by a small star where they will fall. Turn one to the top to bring the heat beneath it and catch four times its heat, or keep life clear of it.
* Without a phone's sensor, gravity is fixed a little down the screen and mostly into it, as if you were looking down at a globe on a table.

**Reading it:** everything that matters is drawn on the world itself, as a surveyor's marks.
* Nothing is a control, and nothing on the world is written; only the aim is marked, in dots. The vent has no mark of its own: the heat gathering beneath it rises as smoke, a wisp now and then while there's little, heavier as it builds, and a dark column once it would burst. Tipped, you see the lava pour. The heat left is told by the era.
* Marks for what's coming, as a map marks places, with no words beside them. Where life wishes for a kind, a few of that kind's signs are sketched there in broken pencil, as a surveyor pencils what's yet to be inked. Where a stone will fall, a small six-stroke star; it turns red if the heat is beneath it to catch it. What they mean is told once, in the quiet line at the foot ("Life wishes for forest where it is pencilled: high ground", "A stone is coming"). Even the pen's nib is hidden, so nothing on the world looks like something to press.
* Nothing is written on the world to teach it. The card the world begins from says what there is to know (level gathers, tipping pours, heavy smoke then a tip bursts, too long tears it open), and the world shows the rest. Ideas still come in one at a time behind the scenes: stones only begin once the rest has had its turn. Only the turns in the world's story are ever said, quietly, at the foot above the key.
* Off the world there's only the era at the top, as a map's title, and the key at the foot: the six kinds by their signs, inked once each is living.
* Nothing is named: the map is the land's.
* On phones that can, a burst is felt as a soft pulse, and a caldera as more. The camera eases out as the land spreads (a pinch takes over for a while), and the drawing gets less fine if the phone can't keep up.

**Kept as it's played:** the world is saved quietly (in IndexedDB) every 15 seconds and whenever the page is hidden. Come back and the card says *Your world, as you left it*; touch it and you're where you were, and however you hold the phone then is level. `?seed=` starts that world fresh instead.

**Smooth by design:** the heavy work never runs on the page's own thread, and nothing jumps. Each new surface eases in from the last over about as long as it took to come, so the land grows rather than stepping; and the contours are kept in two sets, each redraw fading in over the last as the last fades out, so a line drifts instead of jumping, and you don't notice unless you're watching for it. (Contours drawn in the surface's own shader moved perfectly smoothly, but followed the mesh's triangles and came out jagged on steep slopes, so the drafted, smoothed lines stay.) The map is corrected seldom: contours every 1.5 s while lava runs (4 s at rest), life every 3 s, the camera easing gently; steam is a wisp or two, not a cloud; and on the ocean world wishes and stones come rarely (every 60–100 s and 90–150 s), so the chain stays the point. A contour keeps who it is as the land grows beneath it (known by its level and where it lies, not by its exact points), so it stays inked and keeps its age instead of being pencilled or fading in afresh each time the lines are drawn again.
* Contours and life's signs are drafted in one worker (`drafts.ts`), and the finer surface is carried, raised and given its normals in another (`surface.ts`). Their results come back packed into flat arrays and move between threads without being copied.
* What comes back is taken up one piece a frame (one pen, one kind), never on a frame that has already redrawn the surface or used much of its time, and never more than a few frames late.
* The simulation's slow forces run in halves a step apart, with life the step after, so no one step carries them all. The sea's colour is worked out in the shader from depth rather than uploaded.
* In a headless run with lava flowing, the page's own work per frame went from a worst of 35 ms to 13 ms, with 95% of frames under 9 ms.
* If a page can't start workers, the same work is done on the page, only less smoothly (`offthread.ts`; `?noworker` tries it in development).

**What you see:** it keeps to the language of the old survey and geological maps, not light and effects.
* **Lava flows as a viscous liquid.** Its flux rises with its depth to the power one and a half, close to how a Bingham fluid (the usual model for lava, as in the MAGFLOW simulator) runs down a slope. So a flow's thick core runs and pushes its thin margin ahead of it in blunt, rounded lobes. The rate was set so lava of the usual depth flows as fast as before; thin margins move about two-thirds as fast, thick cores faster. It's drawn by its depth, not just whether it's there, so its edge falls between the simulation's vertices and slides smoothly as it spreads, rather than stepping vertex to vertex.
* **Lava takes its time.** It used to move half of each vertex's lava every twentieth of a second on any real slope (the step's cap, which every slope hit, so the rules' flow rates did nothing), and a smear thinner than the least that runs set at once; on Mars about nine-tenths of a pour froze that way at the flow's edges within seconds. Running off and thin setting are now rates per second, and lava runs, thins and cools on its own slower clock (three-tenths of everything else's), with pours lasting about twice as long. Since the three slow together, a flow ends about where it did: bots reach Mars's 28 km at the same moment as before, and the other worlds' aims come out about the same; but on Mars lava is now molten for 196 of a bot's first 240 seconds instead of 72.
* Lava is laid on in the vermilion geological maps give it, but alive: deeper where thick; its edges chilling first, dark round a glowing core; never quite still, a slow shimmer drifting through it; and fine lines creeping downhill in it, the way it flows. Once it stops it's black, with a clean edge (carried as where it lies and how black it still is, so the shader can divide the one by the other and keep the black even right up to the edge), weathering back into the ground's own colour over a minute or two. A burst throws a fountain of embers that arc and fall back. All of it drawn in the surface's shader.
* Edges of lava, of ground lava has lain on, and of set lava are drawn about a pixel wide everywhere. Each mark is known only at the simulation's coarse vertices. So it's widened by half a step (running lava, so a thin stream survives) and eased toward its neighbours eight times, which rounds the grid's steps into a curve. The edge's softness was once given a floor, and it then changed from one small triangle to the next and showed as regular teeth along every flow; held to a pixel, those jumps can't be seen. On the ice moon, water doesn't crust black as it sets: it freezes into the white new ice, its shimmer is pale light rather than orange heat, and its edge darkens blue.
* Smoke, steam and ash are fine stipple, dot by dot, rising, drifting apart and fading: a soft plume that thickens as the heat gathers, drawn over the map, not hidden by the slope it drifts up.
* Where something lives, the ground takes its kind's colour as a thin watercolour wash, stronger the more there is, easing in and out over a second or two; the land's colour is laid on unevenly, a little darker where it pooled, in soft blotches fixed to the ground. Over the wash, life's signs are set small and in patches (a smooth noise over the world decides where each kind grows thick, thin or not at all), and they fade in and out over seconds rather than popping, keeping their age if they come back.
* Each kind of life is drawn by a little picture of what grows there, so it reads without the key, and tinted as hand-coloured maps were, in soft watercolour inks. Every sign is a few pen strokes kept once in `render/signs.ts` and drawn from them on the world, on the chart and in the key. No two neighbours need look alike: each sign has a few shapes (round trees and conifers, reeds in threes and fives), and each is drawn its own way by where it stands: one of its shapes, a little larger or smaller, leaning a little, some mirrored, and its colour somewhere between its kind's two inks, lighter or darker:
  * moss: fine stipple, sage to olive green;
  * reef: a fine coral stipple in the shallows, coral to ochre (as signs, its scallops read as a field of little waves);
  * mangroves: reeds rising from the waterline, olive to root-brown;
  * meadows: grass tufts, yellow-green to straw;
  * forest: small trees, leafy or conifer, deep green;
  * heath: low shrubs, heather purple to brown.
* The sea has only a few depth lines, set wide, and no water-lining: less on the map, and less changing, is calmer (Mars felt smoothest because it has least on it). Breakers are short blue strokes where the sea wears a coast. The shading is kept flat, like paper.

**The ending:** when the fire is out, a long age passes quickly while the sea and rain work on what you made. Then the chart is drawn round the world in place: a pen goes round the plate's double border, the world steps back and up the page, and what lasted and the eras, with what happened in each, come in at the foot above the key. You can still turn the world and look at it. A touch begins the next world (or this one again), and "keep the chart" saves it as a plate (PNG). Inside a frame, as in the claude.ai viewer, which can't hand over a file, "keep the chart" isn't shown.

**Drawn as prints (every world; `print.ts`).** On the card, the ink row chooses the quiet print (every world's default now), engraving, watercolour, stipple, glow or the full print, or the look as before; it's remembered world by world (`?look=quiet|engrave|water|stipple|glow|print|plain` too). On the ice moons the print's inks are water's blues (a burp's clots freeze to frost there, and its ash is frost). Each world keeps its own colour as one loose wash over all its land. Worlds without a sea have no coast or sea washes: their stipple shades relief and the side turned from the light, as an engraved globe is shaded, under a faint graticule. Marks a world keeps (the Moon's seas, stippled darker as lunar charts draw them; the ice moons' new ice; Io's sulphur) are washes of their own, with ragged edges. On the ice moons the woodblock is cut in water's blues. The lava lamp's blobs are woodblocks too: a flat block, cut, in a black outline. On the deep ocean the sea's contours stay, since they show what's rising beneath. Everything is worked out per pixel in the ground's shader from what it already has (height, the lava's marks, the ground's colour):

* **Stipple on cream paper,** crowded along the shore, thinning inland, gathering on slopes turned from the light and at the world's edge. The dots are pinned to the ground, as Return of the Obra Dinn pins its dither, so they turn with the world and never crawl: one dot to each cell of a lattice lying on the world's shell, two lattices turned against each other so no grid shows, each dot drawn once the darkness wanted there passes its own threshold, at a fixed size on screen. Seen from far, where they'd crowd into moire, they give way to their average tone.
* **Washes laid by hand:** sea-green along the coast, wide here and narrow there; loose ochre over parts of the land; and life's own colours, each an even wash with a ragged edge, a darker rim where the pigment pooled, and grain. A dotted graticule over the sea; a crisp coast; the land's contours fainter, the sea's left out.
* **Lava with weight.** A pour comes as a real eruption does: a trickle that swells to its height and tails away (over 1.5–1.7× the old pour time). Before a burst the ground round the vent warms in a soft glow that widens as the pressure nears what it can hold, with a long shudder in the hand on the brink. A burst is a moment: the view eases back and holds, and the words fall quiet. Living ground the lava reaches is scorched charcoal a while before it's buried. (Glowing cracks, before a burst and in new crust, were tried and dropped.)
* **Print lava** (the full print; the quiet print below is every world's ink now), after 1960s Soviet science books: heat in three flat bands of ink (yellow core, vermilion, dark red), no gradients and no outline, the colour plate a little off register (differently across the world, as if each pour were another pass), ink starved in specks, on twos; while fed, the bands pulse outward from the vent; set, it keeps glowing and cools band by band (vermilion for about ten seconds, dark red till twenty-five, flat grey-black till forty-five) before breaking into the ground's stipple, since Mars's lava sets in seconds and a flow was gone before it could be seen. (A flat red arrow along each flow was tried and dropped.) Its inks glow by their own light rather than being shaded with the ground (lit, they'd dulled to pastel), and are given as printed and made linear for the screen (which had turned the red to coral). An eruption throws ink splatter round the vent in jets, a fine spray with a few fat drops, fixed to the ground so it spreads rather than flickers, and every running edge is sprayed onto the ground a little rather than cut clean. For texture, without lines: the ink is pressed, never quite even (mottled heavier and thinner, the paper's grain through it, a little built up along each colour's edge, as a press squeezes it); dark crust plates ride the red, carried slowly downhill while the vent feeds the flow (an accumulated drift, so they stop rather than jump when it stops), none on the yellow core and more far out; set lava skins over with still crust as it cools; and the yellow and red are separate plates out of register, the yellow overprinting the red a deeper orange in places and leaving a sliver of paper in others (all round, it read as an outline). The crust is graded, small scattered flakes where it's hot and fewer, bigger plates where it's cooler (one even scatter read as camouflage). The yellow core follows the deepest lava down the flow, pinching and swelling, rather than sitting round the vent like a yolk; while fed it breathes, widening and narrowing all together (rings pulsing outward striped long flows). The splatter is sparse and thrown wide, its drops well apart. The misregistration was first a shift along how fast the lava changes from pixel to pixel, which jumps from triangle to triangle of the mesh and stepped the edges in teeth; it's a slow noise now, and the edges wobble irregularly at about a triangle's size. It lives: the edges and the core heave slowly; now and then a bubble of the next hotter ink swells on the deeper lava and pops in a ring of drops (few and well apart; a speckle of them was too much); and now and then while it erupts the vent burps: gas swells under the crust, a dark, lumpy dome stretching till the heat shows through it in blotches, and tears out, flinging torn clots more one way than another, which land hot, darken to black, lie a while and crumble, with dark ash blown out the same way, felt as a knock. Every burp is its own (mostly small, now and then a big one, thrown its own way, every six to fourteen seconds); the first, a pale dome popping in a neat ring of drops, looked like a cartoon. (Drawn only; the simulation knows nothing of them.) (Chosen from a live study of four traditions: Fantasia's crust plates, Soviet print, the two combined, and Spider-Verse halftone.)
* **Stipple and glow lava, on Mars to test** (Mars opens on stipple; its card offers engraving, watercolour, stipple and glow, its choice kept for Mars alone). *Stipple*: the lava made of the planet's own dots on a coarser lattice, densest and brightest where hottest, over a warm wash, feathered at the edge, set dots black and thinning as it weathers. *Glow*: a soft body of colour graded by heat, warmth drifting in it, darkening to crust at its edge, a pale grey shadow once set. Both coloured by heat as real lava is, with a warm glow on the ground round a fed flow, and no outline.
* **Watercolour lava, coloured by heat** (Mars's first ink, to try it on a world where lava is everything; chosen on its card, kept for Mars alone): no outline, a wet wash with a ragged edge coloured as real lava is, from yellow-white at the core near the vent through orange and red to a dark crust from the edges in, pigment drifting slowly in it, the ground's stipple covered beneath it, and a warm glow on the ground round a fed flow; set, it dries to sienna and grey, then fades. On every world the lava's edge now eases over about half a second, so it glides as the flow spreads instead of stepping vertex to vertex. (Chosen from a live comparison of stipple, glow and watercolour lava, none with an outline.)
* **Quiet print** (every world's ink; `?look=quiet`): the same print turned down, so lava is the one warm accent on a calm map rather than the whole picture. Softer inks (a warm vermilion like the engraving's, a rust, an ochre; paler blues on the ice moons), laid on the paper as a wash with the ground showing through and only a little of their own light; moving smoothly and slowly (not on twos, no breathing, the edges heaving at a third the pace); fewer bubbles and lighter crust; little spray at the edges, and splatter only when it bursts; set lava red for a few seconds, rust till about twelve, then a faint shadow on the paper gone in about half a minute; burps only at the brink, while pressure is held near what the cone can bear, as a warning (so the violence is the player's doing); and lighter, paler smoke with no red beneath it. Its gold has one job: it shows lava still arriving, not the hottest band. A pale warm gold (not lemon) near the vent and down the deepest of the channel while the vent feeds the flow, the one part with its own light; once it stops, the gold draws back to the vent over about four seconds and goes out, so you can tell at a glance whether it's pouring, finishing or done; and as pressure builds, a small spot of gold warms the ground at the vent, widening, before anything pours. Its smoke reads the pressure the same way: drawn as the paper left bare (a cream a little lighter than the page, as a print leaves smoke unprinted; steam a pale blue-white), a thin wisp at rest, a taller, fuller column as the pressure builds, dark only at the brink; small puffs in a close stream, so it's one column, leaning with the breeze; and casting a faint shadow on the map, away from the light and further the higher it's risen, as a map-maker shows height without perspective. A burst's ash stays dark: the one time it is. So the volcano reads without words: smoke for building, gold for pouring, terracotta fading for cooling. (Made when the print, with everything added to it, had gone from meditative to chaotic.)
* **Smoke, steam and ash as printed billows** (`puffs.ts`): each a lumpy shape in two flat tones, lit above and shadowed beneath, its lobes turning slowly, with a fringe of halftone dots beyond its edge so it's vapour and not a stone; growing as it rises, overlapping its neighbours into a column; leaving the vent a faint wisp; the youngest smoke over lava warmed a dark ember red beneath; and at the end breaking up into specks of paper, as worn ink does, rather than fading. (They were single fine dots of stipple rising in strings, which looked like beads, and cheap.) A burst throws a dark column of ash billows. Embers and a storm's dust stay dots.
* **Engraved lava** (the default ink): running lava is laid with a warm vermilion tint, strongest near the vent, and engraved with red-brown lines that run downhill, out from the vent, as geological maps hatch a flow, swelling where it's hot; the lines are whole, swelling and thinning along their length, the swellings drifting outward while the vent feeds it (they were dashes first, which looked busy), with more lines fading in between as the flow widens; its front is one bolder deep-red line. (Played, the first engraving read as a pale bull's-eye: its lines ran parallel to the flow's edges, its tint was too faint to tell running lava from set rock, and a fed pool looked still.) (On phones the first version drew no lines, and a fine triangular lattice showed across every world: the stipple and the lines measured how fast values change from pixel to pixel inside branches, which phones' GPUs leave undefined, and the noise was hashed with `sin` of large numbers, which they work out roughly enough to make patterns. Both are now worked out before any branch, and hashed without `sin`.) Set, it's a soft grey wash over its stipple, fading as it weathers (diagonal hatching was tried, and read as rain). (Its lines first froze where they stopped, but with no flow left to follow they fell back on a fixed swirl, which covered cooled fields in black fingerprint whorls.) One fine line rings a running flow. The lava lamp's blobs are engraved the same way. On the ice moons the inks are blues. (Before this the lava was a woodblock: a block of vermilion cut with drifting gouges; then its cuts became particle streaks, as wind maps draw the wind, which looked a step down and were dropped. A live comparison of engraving, isotherms and marbling chose the engraving.)
* **Craters, as lunar charts draw them** (the sim keeps every bowl it digs, `craters`): a crescent of dots on the inside wall nearest the light, the far wall bare, the floor lightly dotted, a rim of close stipple, heavier on the side away from the light (a solid rim line read as an outline), and round a fresh crater a spray of dots in rays that fades. Contours are kept only where height is the aim (the mountain on Mars, above its plain, and the asteroid's hollows; and the deep ocean's sea contours): elsewhere the stipple shows the relief and the lines only cluttered it. Contour loops inside craters are left out, and the contours are set wider, so they don't crowd a mountain; the aim's dots are bolder.
* **Watercolour lava:** a wet wash with a ragged edge, pooled dark at it, pigment drifting inside; set, it dries to sienna, then grey, and goes, leaving stipple behind.
* **No outline round the world.** Washes thin away at the rim too, and Io's sulphur is a lighter wash with no dark rim. Lines (the coast, the graticule, crater rims) fade out as the ground turns edge-on at the rim, and the stipple's far-off tone is kept light, so every world ends in a soft edge, as Enceladus's always did. (Seen edge-on, the height crosses the sea everywhere, and the coast line had inked a ring round the sea worlds.)
* Lava under the sea is hidden, as it always was (it first showed as halftone over the shallows).

**Drawing:** the world is drawn on an icosphere of twice the simulation's detail, with values carried across by Loop subdivision (`fine.ts`). The coast's colour edge is chosen per pixel. Contours are first eased along (each point drawn toward its neighbours, which takes out the sawtooth a line gets crossing triangles on a steep slope), then rounded by Chaikin corner-cutting and drawn as joined, antialiased ribbons (`widthPx` in `PlotterLines`), at up to 3× pixel ratio, and never below 2× on a sharp screen however slow the phone, so nothing looks pixelated. The light is almost flat, and ash and fresh rock are only light tints, so the ground reads as clean colour, not smudges. Where lava lies, and where it has lain (the Moon's seas, the ice moon's new ice), is carried to the finer surface as an amount, not a colour, and the shader draws its edge where the amount crosses a half, a pixel wide: a clean edge at any zoom, not the soft, saw-toothed smear colour carried vertex to vertex gives. (Zoom stops before the simulation's own triangles would show.) A finger resting on the world and then dragging spins it at once, and two fingers twist it about the line of sight as well as zoom, so it turns any way at all. Add `?seed=` to the URL to see the same world again.

Files: `sim.ts` (the planet), `ecology.ts` (kinds and wishes), `islands.ts` (finding islands), `fine.ts`, `puffs.ts`, `chart.ts`, `save.ts` (keeping the world), `drafting.ts` and `drafts.ts` (lines and signs, off the page's thread), `surface.ts`, `offthread.ts`, `main.ts`.

Locally, run `npm run dev` and open `/volcano.html`. The simulation (`src/volcano/sim.ts`) has no drawing in it and is tested in `test/volcano.test.ts`.

## Run it

```bash
cd scan-to-world
npm install
npm run dev        # opens on your LAN too (vite --host), so you can try it on a phone
npm test           # contour / heightfield / sculpt unit tests
npm run build
```

The site is published to GitHub Pages from `main` by `.github/workflows/pages.yml` (see below for turning Pages on).

**On a phone:** open https://benhammer85.github.io/scan-to-world/ and add it to your home screen. It then plays offline, full screen.
* **Loading a scan:** tap the empty paper round the world to pick one from Files. Scaniverse is free, and its GLB or OBJ export works.
* **On Android:** once it's installed, it also appears in the share menu, so a scan shared from another app opens straight in the game.

**Specimens.** Tap the paper round the world and a cabinet of specimens opens, drawn as an old natural history plate:
* an orange, a toy brick, a chopstick, a pistachio (with a valley in its split seam), a river pebble and a bath duck;
* a last place for your own scan.

**The atlas and the celestial railway** (`src/atlas/atlas.ts`). Pinch out past a world and the camera pulls back to a celestial chart: every world you have made, on a dotted graticule among the stars, and the specimens not yet made as uncharted, dotted places with their figures.
* **The chart's paper:** as you rise into the atlas, the page turns a shade warmer: the same stock, plain, with no stains or foxing. Stars are inked as dots, and the brighter ones as small crosses. Faint constellation lines stop just short of each star, as on an engraved chart. The stars are placed by a fixed rule on a fixed grid, so the sky stays put as more worlds are added.
* **Magnitudes.** Each world wears engraved rays round it, as a star atlas shows a star's magnitude: more and longer the more its people have built. From the chart you can see which worlds are thriving before you go down to one.
* **Your light hides the sky.** The more your people are building just now, the fewer stars the chart shows, the faintest going first. Let your worlds rest and the sky fills again, and on the quietest nights small unnamed places appear between the worlds: others, keeping dark. Nothing on the page explains it (`SKY` in `src/atlas/atlas.ts`).
* **In the atlas:** tap a world to fly down into it, tap an uncharted place to make it, and pinch in to go back.
* **Laying a railway:** drag from one world to another. The line leaves a station at the town facing the other world (or founds one there), and is laid from both ends to meet in the middle. It is drawn the way a star atlas draws a comet's course: a fine line with small rings marking its places, a ring at each station, and the sign for a station at its halfway point.
* **The train** is drawn as a comet with a thin tail. It runs out and back, and each time it comes in, its settlers grow the town at that end.
* **Facing:** in the atlas each world turns so its station faces along its line.
* **In a world:** you can see the line going off into the sky.
* Its details are drawn to the eye, so a train is still a train from the chart.

Each specimen is a solid described by its signed distance, meshed by surface nets into one closed surface of about 20,000 triangles (coarsened until it is, so a phone can turn it). Smooth ones take their height from the middle, as they have no bumps for curvature to find. Every world you visit is kept as you left it for the session.

It boots with a procedural **demo orange**. To use a real scan, export GLB, OBJ or PLY from
Scaniverse, KIRI Engine or RealityScan and load it with **Load scan**. If the scan is heavy,
use **Decimate to** (meshoptimizer, respects UV seams) and aim for 5–15k triangles. For
multi-million-triangle raw scans, decimate in Blender or in the scan app's export first.

## Touch

There are no buttons, modes or menus. The screen is the object and nothing else.

| Gesture | What it does |
|---|---|
| Tap | Only what can be seen from high up can be touched. In empty country it sows a new place; on or near a light, that place grows towards your finger; on a wood it is cleared, on farmland it goes back to the wild, on a steep slope a wood is planted. Fine ink rings open where you tapped (one pencil ring closes if the ground refused) |
| Drag | Turns the world freely, to any angle. Turning is time: a full turn is a day. A place grows two or three houses a turn at first, faster as it grows, and its light spreads and brightens |
| Hold still on the object | Presses into the ground, deeper the longer you hold |
| Hold, then pull | Pulls the ground up. How far you pull is how high it goes, and moving back lets it down again |
| Arrow keys | On a desktop, a push on the spin like a small fling: they turn the world and pass the days the same way a drag does |
| Pinch or scroll | Comes a little closer (never near enough to see what anything is), or out to the atlas |
| Drop a file on the window | Loads a scan (GLB, OBJ or PLY) |
| Three fingers held, or the <code>`</code> key | Opens the tuning drawer, which is for development and not part of the product |

A fine ink ring appears the moment a finger takes hold, before any work happens, so you know you were heard. Changed contours show as pencil while you work, and the pen inks them when you let go.

The object picks its own height method from its shape (`chooseHeightMode`): radial for round things, curvature for everything else. The recogniser (`src/interact/gestures.ts`) only turns pointer events into intents, so its rules are unit-tested. The feel constants live in `TOUCH` in `src/main.ts`.

## Pipeline

```
scan file ─► load.ts         merge meshes, centre, scale to radius 1, optional decimate
          ─► topology.ts     weld UV-seam duplicates, adjacency, normals
          ─► heightfield.ts  per-vertex elevation: radial | curvature, smoothing, percentile normalise
          ─► + sculpt.ts     touch edit layer (Gaussian / diffusion), optional surface displacement
          ─► contours.ts     marching triangles + segment chaining  → Polyline[]
          ─► plotterLines.ts stroke-reveal shader (arc length + per-line timing)
          ─► settlements.ts  towns: founded by a tap, grown by turning, on ground gentle enough to build
          ─► buildingMarks.ts buildings as pen marks along the contours
```

`src/world.ts` connects these stages for one object. `src/main.ts` handles the scene, UI and input.

### Notes on each stage

> **Note.** Much of what follows describes the simulation underneath: towns with streets, houses, terraces, walls, churches, castles, harbours and fields. All of it still runs and still shapes where people build. But from the height the game is seen from, none of it is drawn as itself: it is drawn only as light (see "The look" above and [STYLE.md](STYLE.md)). The code that drew buildings and landmarks was removed in the lightness clean-up.


* **Heightfield.**
  * `radial` measures distance from the centroid. Use it for round, bumpy things like an orange, a rock or a potato.
  * `curvature` measures how far each vertex sticks out past its neighbours along the normal. Use it for anything else, such as a LEGO brick, where the studs and edges become ridges. It's noisier, so selecting it raises smoothing to 6.
  * Values are normalised with a 2% percentile clip so scan spikes don't flatten everything. **This is the stage that needs visual tuning.**
* **Contours.** Levels sit at fixed multiples of `1 / bands`. Editing bends existing lines or adds new levels, and the rest stay put. Holes in a scan give open polylines, which are handled.
* **Live reshaping.** Brushing updates the edit field every frame. Contour extraction is throttled to about every 70 ms. Rebuilt lines appear fully drawn instead of replaying the plot.
* **Settlements.** A tap founds a town on the nearest buildable ground within reach, or refuses with a grey ring. Buildable means gentler than whichever is higher: the object's own 60th-percentile slope, or an absolute floor, so gentle ground is always buildable. Towns grow outward along the cheapest ground by path cost (climbing and height cost more), keep a fixed spacing in world units, and never take a building back. Growth is batch-independent (one day in one step builds the same town as a hundred steps), and founding a town moves nothing in another. All of this is tested. Buildings sit on vertices, so they ride the ground when it's sculpted. They're pencilled in while the world turns and inked by their own pen once it's calm. On the orange, 83% of the surface is buildable, and the flank of a pulled-up mountain measured 27 of 27 vertices refused.
* **Streets.** Every building except the hall gets its own street, grown from its door to the first street it meets (whatwesaved 5b/5c). A building with no street within reach is refused before it's laid. Streets run along mesh edges, so two streets can only meet at a vertex: every crossing is a real junction by construction. Climbing costs extra, so streets wind along the contours; on the test slope they climb at least 20% less than the ground they cross. Streets keep clear of buildings and buildings keep off streets, checked on the drawn line after smoothing. A building that would wall in its hall is refused: on a coarse mesh the first ring of houses otherwise enclosed it, and growth stalled at seven buildings. Two towns are joined by a road once both have six buildings. Growth runs in true time order across towns, so how time is sliced doesn't change the world. On the orange, 8 days of growth cost 20 ms in total, and the worst single frame was 0.6 ms.
* **Loops.** A street grown one at a time that stops at the first street it meets makes a tree, where every house is a spur. So after each street is laid, the town looks along it for a nearby point on the network that is close over the ground but at least three times as far by street, and lays a lane between them. That's the old app's "road distance against the crow flight", and the same test keeps lanes from duplicating a street that runs alongside. Over three towns, the average detour between houses went from 1.80, 1.81 and 1.98 without lanes to 1.47, 1.40 and 1.42 with them. No lane formed until houses were spaced at least 1.7 mesh edges apart. Streets run on the mesh, and closer houses took every vertex, leaving no ground to cross. House spacing is now whichever is larger: 0.065, or 1.7 mesh edges.
* **Frontage.** Streets come first and houses fill the frontage. A house goes on the best free plot beside one of its town's streets, long side facing it. When there's no frontage left, the town lays a new street: a short link climbs from the network to the cheapest open ground, and from there the street runs both ways along the contour, keeping clear of other streets so a row of houses fits between them. A street that no house could front is refused before it's laid. On the orange, 56 of 58 buildings face a street (the other two are halls), and over 80% of houses share their street with others. The old model was one spur per house.
  * Measuring contours honestly took three rounds. Continuing the link's own direction sent streets uphill, and weighting the climb harder moved the number from 0.82 to 0.81. Laying the street both ways along the contour fixed the mechanism, but the number still read about 0.8, because on a triangle mesh even the least-climbing edge at each point climbs 0.72 of the mean. The test now measures against that floor: contour streets come within 1.3× of the least climb the mesh allows.
  * Loops still help with frontage, but less: the detour went from 1.77, 1.72 and 1.80 to 1.49, 1.58 and 1.62, because contour streets already connect better.
* **Square and market.** Founding a town opens a square round its hall: open ground no house or street may enter, whose edge is itself a street, so houses front the square and the first streets lead out from it. A town is only founded where the whole square fits on free, mostly buildable ground. The square is at least 0.1 across, or 2.6 mesh edges on a coarse mesh (whatwesaved PRINCIPLES.md, 12). For the same reason, a tap's reach on a town now extends past its square: a fixed reach fell short of a coarse mesh's square, and taps on towns were refused. When a town reaches 10 houses its market opens: stalls in the square, each facing the hall, with one more every 4 houses up to 8. Stalls are only ever added, never moved. On the orange, two towns grew 14 stalls in 12 days.
* **Water** (`src/nature/water.ts`). Water comes from the shape of the ground:
  * **The sea.** A planet has a sea over its lowest 15% of scanned ground, spreading from the lowest scanned point. Both are fixed at load. Using the current lowest point as the drain was unstable: a pit dug deeper than anything else became the drain and stayed dry.
  * **Lakes.** Every other hollow fills to where it would spill, draining in the end to the sea (priority-flood on the mesh). A hollow only counts as a lake if it's deep enough and wide enough, in world units.
  * **Digging.** Press into dry ground and the hollow fills, live, as you dig.
  * **Drawing.** Water is drawn as a map draws it: a shoreline, blue depth lines parallel to it, and the ground tinted blue, deeper bluer. Land contours stop at the shore. Water fades in rather than being plotted, because nobody made it.
  * **Towns keep out.** No house, street or square is laid on water. The mask they keep out of is the same one the shore is drawn from (whatwesaved PRINCIPLES.md, 1).
  * **On the demo orange:** a southern sea and 4 lakes, 40% of the surface. An update takes 3.6 ms, down from 49 ms once the mesh's fixed facts were cached.
* **Harbours and bridges.**
  * **Harbours.** A town with 6 houses and a street on the shore gets a harbour: a pier from the shore street nearest its square, out into ever-deeper water, with a head across its end. Boats moor alongside, one more every 8 houses, up to 4.
  * **Bridges.** Roads and loop lanes may cross water, but only where the water is at most 0.14 wide. A step over water costs 3× a step on land, so a bridge is only built where it saves a real detour. A bridge is drawn as a deck: two rails with splayed ticks at each end.
  * **Wider water.** No street stands in water except as a bridge, and nothing bridges water wider than the span.
* **Floods and rebuilding.**
  * **Drowning.** When water rises over what was built, it drowns. Nothing is removed (the record only grows). Drowned houses and sunken streets move from ink to the water's blue and show through it like a drowned village.
  * **Streets.** Sunken streets leave the network, so nothing is routed along them.
  * **Squares.** A flooded square is drawn in ink only where it's still dry.
  * **Rebuilding.** The town owes what it lost and rebuilds it on dry ground, one extra house a day for each loss. On the orange, a pit dug into a town drowned 5 houses, and four days later it had grown back past where it was.
  * **When the water goes down,** drowned houses become ruins (the corners of their outline), their ground is free, and sunken streets are streets again.
* **Springs and streams.**
  * **Drainage.** The water-filling pass also finds which way every point drains: to the point it was reached from, which is lower or level and nearer the sea, so water can never run in a circle. Rain on every point is carried down that drainage.
  * **Streams.** A stream shows where at least 0.3 of ground drains through a point, and it becomes a river, drawn with two banks, past 1.1. Lakes with enough ground above them get a river from their outlet.
  * **Springs.** Sculpting is the spring gesture: pull up a mountain and streams run off it.
  * **Towns.** Streams take any house they come to run through. Streets never run along a stream and cross one only by a small bridge.
  * **On the demo orange:** about 7 streams and 2 rivers.
* **Snow and ice.**
  * **Snow** lies on the highest 8% of scanned ground (a snowline fixed from the scan, like the sea level), drawn white with a dashed snowline.
  * **Snowmelt** gives three times bare ground's water, so streams start from the snowcaps.
  * **Ice.** A lake whose surface stands above the snowline is ice: pale, with a shore but no depth lines.
  * **Towns** don't build on snow, and town streets stay below it. Roads may cross.
* **Roads to harbours.** Roads carry what towns trade, so any two ports are joined port to port, even where the towns already had a road. A town only becomes a port once its streets reach the water, which is usually after its first road: measured, the road came at 6 houses and the harbours at 7 and 37.
* **Ferries and sailing boats.**
  * **Ferries.** Harbours on the same water get a ferry: a dashed way over the water from pier end to pier end.
  * **Sailing.** Each ferry's boat sails it in real time, easing out of one pier and into the other, resting, and coming back. It's life on the water, not building. Boats out on a ferry aren't also drawn moored.
  * **When water changes,** a ferry whose way is no longer all water, or whose harbour drowned, is dropped and looked for again.
* **Transport.**
  * **Roads wear in with use.** A road starts as a dashed track, is worn into a lane when the smaller of its towns reaches 12 houses, and becomes a made road (double lines) at 24. It never goes back.
  * **Traffic.** Carts, then cars once the world is 30 days old, move along the roads in real time: one on a track, two on a lane, three on a made road.
  * **Railways.** Two towns of 28 houses get a railway, drawn with cross-ties and running to a harbour where there is one. A railway is limited by its steepest pitch, so it's routed by that: first the least ruling gradient any line can have, then the shortest line within 1.2× of it.
    * Costing the climb, or even its square, couldn't do this. Every line over a ridge climbs the same height in all, and the rail's ruling gradient came out equal to the road's (0.575 each).
    * Measured over a test hill: the rail's ruling gradient is 0.474 against a road's 0.575. On the orange it winds 1.78× the direct distance; slack of 1.05 wound it 2.64×, and 1.4 made it steeper than a road.
    * Rails keep off squares and their edges, never have a house on them, and cross streets on the level. Trains run on them.
  * **Level crossings.** Rails and streets both run along mesh edges, so they can only meet at a shared vertex, and every such vertex is a crossing. A test holds that. Crossings are marked with gateposts, and no ties are drawn across the road. When a train comes within 0.07, the barriers drop, and traffic heading for the line waits at the gate. A vehicle keeps the time it spent waiting and runs that much behind. Anything already past the gate carries on and clears the line. Over three minutes of frames on a hand-laid road crossing a railway, nothing was ever on the line with a train.
  * **Fishing.** Up to two of a harbour's boats go out over the water to fishing grounds and come back. Boats out fishing aren't drawn moored.
  * **Cable cars.** A town of 16 houses with snow within reach gets a cable line from its square to the highest snow nearby, drawn with pylons and stations, and a cabin rides it.
  * **Everything that moves** (ferries, fishing boats, traffic, trains, cabins) moves in real time, as life on the map rather than building. All of it costs 0.4 ms a frame.
  * **Between planets** waits for a second world.
* **Squares that read as places.** Tapping about had founded a crowd of hamlets square against square, each with a large pale disc, and they read as rendering bugs. Three fixes:
  * No town is founded within 0.32 of another; a tap there grows the nearest town.
  * Squares are smaller (0.07, or 1.8 mesh edges).
  * A square's edge follows the ground it keeps, smoothed: neither a compass circle nor the lumpy raw ring. (Later neither drawn nor paved: see *Growing up*.)
* **Legibility.** A screenshot of three towns near snow and water read as one tangle, because contours, streets, roads and square edges were all the same thin black line. The drawing now uses a map's hierarchy:
  * **Relief** is faint and brown, behind everything.
  * **Streets** are double lines, as a town plan draws them, and roads between towns are wider.
  * **Houses and stalls** are filled solid. The pen still draws each outline first, and the fill comes once it's inked.
* **Clean drawing.** The plan's shape is kept, and only the drawing is tidied:
  * **Squares have a smoothed edge.** Streets that meet the square end exactly on it, though the edge itself isn't drawn.
  * **Stalls keep their slots.** Stalls fill slots round the hall in order and never move (see *Organic* for how each sits in its slot).
  * **Houses face their front.** Each house is turned towards the street point it fronts, give or take its own small turn. Reading the street's own direction instead gave odd angles on links and loops.
  * **No stray ticks.** Street runs under two mesh edges are refused before they're laid, and fragments under 0.015 after trimming aren't drawn.
  * **Nothing is buried.** Houses and stalls are flat and lifted as a whole by the most any point of them needs. A flat mark at a fixed lift over a bump in the peel buried its short sides and drew as "//". Laying each point on the ground separately fixed that but made houses wobble. A test on steep bumps catches both. Two lessons from the old app came back while building it. The first version of the burial test passed with the fix switched off, because its reference was wrong (principle 4b). And the draping's sampling radius held only one vertex on a coarse mesh, so it did nothing at all (principle 12).
* **Organic, not procedural.** Every house was once the same rectangle and every street the same smoothed staircase, so towns read as a grid pasted onto the ground. Each mark now varies, seeded only by itself (a hash of its vertex), so it never changes when the town grows, a turn is sliced differently, or the town is redrawn (principle 20):
  * **Houses** vary in size and proportion. Outer houses are bigger and squarer, and houses near the hall are narrow. Each turns up to ±10° off square to its street and sits a little forward or back. About a third have a wing, making an L.
  * **Streets** are cut round four times, not two, then meander with three stacked waves of their own length and phase. The waves fade to nothing at both ends so junctions still meet exactly. Lanes wander more than streets, and the steep track more than the graded road. A street's two sides swell and narrow slightly along its length.
  * **Stalls** are nudged along and across their slot, turned a little and sized a little differently, so a market reads as a crowd, not a clock face.
  * Tests check that a house still faces its street to within its own turn, that streets are no longer straight between junctions, and that they still end exactly on them.
* **Growing up** (from whatwesaved's `_wear`, `_build_on` and `_perimeter` in `marginalia/city.py`). A town used to be laid out finished: made streets, whole houses and a paved square round a hall from the first tap. Now people live there first and the town builds itself up over time. Every stage is absolute, in days since the thing was laid (`STAGE` in `settlements.ts`), and capped by the town's size. whatwesaved ranked its streets instead, and a town forty presses old came out with the same mix as a town five presses old. Nothing needs extra touch: the days pass as the world turns, and the pen goes back over whatever has grown up.
  * **Farmstead first.** A town is founded with one farmstead, and its huts are reached by dotted paths across the yard. The first building becomes the hall at 8 houses, and only then does the yard open as a square. The square is never drawn as a ring or paved. It's the open ground left between the fronts, where the streets end and the stalls stand. The ringed, paved disc read as a bug in a screenshot. Stalls now always stand clear of the hall; nudging them had pushed one onto it.
  * **Goat paths to main streets.** Every way is laid as a dotted footpath. At 1.5 days it's a dashed track, at 4 days a made street (two lines), and at 9 days, if it's a street at least 0.34 long, a main street, wider. A way is straightened a little at each stage. The town's size caps all of this: tracks from 3 houses, streets from 8, a main street from 16, so a hamlet has no main street running out of it. Ranking which streets became main streets demoted one when a longer street came of age, so the rule is now about the street alone. Roads between towns are tracks from the day they're laid and are made up by the trade they carry, as before. A way the water went over comes back washed out and is walked again.
  * **Huts to houses.** A house starts as a small hut. At a day old it's a house, and at 3 days it gets its wing if it has one.
  * **Terraces.** In the old core, which widens as the town grows, a house 6 days old in a town of 14 or more joins the houses along the same side of its street into one row. The row follows the street as drawn and is cut into narrow houses, each its own depth, so the back steps. It fills a gap of up to two and a half spacings, and stops where a way joins from its side. Stretching each house along its own sides never joined anything on a coarse mesh, because a row's houses stand staggered like the street's vertices.
  * **Blocks, gardens and courts.** Ground enclosed by streets is found as a flood that can't get out past the street vertices. Snow, cliffs and water don't count. Each block is stamped when it's first found, and cutting it with a new street makes two new blocks. At 1.5 days a block is gardens, rows between its houses. At 6 days, near the core of a town of 22 or more, it's built round: a ring of narrow houses round a courtyard, set back from the streets round it, taking in the houses that stood there. Its edge is where rays from its middle first meet those streets. Averaging the edge from its vertices overshot concave blocks and put buildings across streets. A courtyard block wider than its court tapers or leaves a gap rather than filling in solid.
  * Measured on the orange at 45 days: 185 houses, 17 blocks, 9 terrace rows. A redraw takes 43 ms at 186 houses. Finding the three nearest vertices in one pass, instead of sorting them for every sample, took the blocks from 51 ms to 11.
  * Tests (`test/growth.test.ts`) check:
    * each way goes up through its stages and never back, and a hamlet never outranks its size;
    * the main streets are old, long streets;
    * the farmstead comes before the hall, and paths lead in to it;
    * huts come before wings;
    * the look doesn't depend on how time was sliced;
    * rows never touch a street's drawn line;
    * courts stand clear of the streets round them.

* **The country, as an old map draws it.** This came from feedback that the game should be meditative, unique and inspired by vintage cartography, not by city builders. So the look is an old survey's (`src/life/country.ts`, `src/life/countryMarks.ts`):
  * **Paper and ink.** The ground is old map paper with a little of the scan's own colour in it (still `paper` in the drawer; `scan` gives the raw colours back).
  * **Development in ink.** Built ground is stippled in the sepia ink, not drawn as buildings (see "The look" above).
  * **Washes.** Fields and woods are washed in muted hand colour that multiplies the paper, as watercolour does, and fades out at its edges. Laid over as paint, the washes came out as pale fog.
  * **Terra incognita.** The map only shows country that has been surveyed, meaning land near somebody. Everything else stays blank until people spread there.
* **Fields.** The land is divided once into a fixed patchwork of field cells, about 0.11 apart, so fields never reshuffle. A town works 0.3 fields per house, nearest and gentlest first, within 0.8 of its middle. Towns claim in rounds so neighbours share the land between them. The town builds over its nearest fields in time (a cell 30% town ground is taken), and its fields move out. What a field is follows from its ground:
  * By a stream or water, it's a wet meadow with marsh tufts.
  * Just under the snow, it's rough grazing with dotted dry-stone walls.
  * On the steep, it's terraces: level steps along the ground's own contours.
  * A town's first two fields are market gardens, dug in beds that alternate direction.
  * Otherwise it's pasture (a plain wash) or arable, whose fine plough lines run one way across the field and stop short of the hedge, as a headland does.
  * Fields are hedged at once, ploughed after 0.8 days and terraced after 1.6. The hedges carry hedge trees.
  * The arable wash goes round a year of 8 turns: turned earth, green shoots, ripe, stubble.
* **Woods** stand on ground too steep to farm (above 0.45 of the buildable slope) and in scattered copses. They're drawn as an old map's trees: a round crown, shaded down one side, on a stem, upright to the map's north. Fields fell them as they reach them.
* **Farms.** A grown town (18 houses) sends farms out to its far fields, each on its own track (a way that is walked, then worn in, and stays a track). A farm works up to 5 fields, one more every 0.7 days.
* **Gardens and mills.**
  * The outer houses have back gardens, dug in rows.
  * A town of 16 has a windmill, the old cross symbol with its sails turning slowly, on its highest arable field.
  * A town of 8 has a water mill, with a turning wheel, where a stream runs under one of its ways.
* **Seeds, and changing course.** A tap is a seed, and the ground says what of:
  * **On a town:** it grows there.
  * **On a field:** the field goes back to wood. A planted wood is kept, and the town builds nothing there, so a wood can steer where a town spreads.
  * **On a wood:** it's felled, and fields may take it.
  * **On ground too steep to build on:** a wood is planted, and grows from saplings over 4 days.
  * **In the country near a town:** a farm is planted, with a track back to the town.
  * **On open ground anywhere else:** people, a new town.
* Tests (`test/country.test.ts`) check:
  * the patchwork is fixed;
  * fields are claimed near their town and never on its streets, and move out as it builds over them;
  * terraces are on the steep;
  * a spared field stays wood and is never built on;
  * a felled wood opens up;
  * a planted farm has its track and grows its fields;
  * the year comes round.

* **Landmarks** (`src/life/landmarks.ts`), as an old map marks them:
  * **Walls.** At 30 houses a town is walled round its old town (its first 30 houses), with a margin. Its course is pegged out dotted while it is built, then drawn as a double line with square battlements, bastions in a town of 55, and gatehouses where made roads and main streets go out. Where it stands is recorded and never moves. When the town has 160 houses and three outside for every one within, the wall comes down, and its course becomes a boulevard lined with trees.
    * Gapped for every lane that crossed it, a grown town's wall was nothing but gaps.
    * Laid at the nearest vertex's height, it sank under the peel's bumps and couldn't be seen. It now takes the highest of the three nearest vertices.
    * Walled round every house near the middle, it took in the snowfield.
  * **The church** stands on the square once there's a market, at 14 houses, facing the map's east, with graves to the north. At 60 houses it's a cathedral with a cloister.
  * **Country houses.** Tap a farm of a town of 20 and it becomes an estate:
    * its house, with a front range and wings round a court;
    * its fields become park, with single trees in the grass;
    * after a day, a parterre and an avenue down its drive;
    * after two days, a washed lake.
  * **The coast.**
    * Fish traps in the shallows from 6 houses.
    * Salt pans on the flat shore from 10.
    * A quay at the harbour.
    * From 12, a lighthouse on the headland with the most water round it, its light going round as a dotted ray.
  * **The high ground.**
    * Beacons, the survey's triangle, on every surveyed summit.
    * A quarry, an arc hatched down into the pit, in the nearest cliff of a town of 12.
    * Sheepfolds and shepherds' huts on the high grazing.
    * From 22 houses, a pilgrims' way winding up by the easiest going to a shrine on the highest summit near.
  * **Orchards** on gentle slopes, trees in staggered rows. **Avenues** of trees along made roads out in the country.
* **Memory.** When the town builds over a field, the map remembers it: its hedges stay as fine, far-apart dots, as old maps mark the site of something gone. Together with the ruins the floods leave and the boulevards where walls stood, the map becomes a record of what grew there.
* **Keeping it smooth.** A grown world's redraw takes 110–180 ms. While the world turns, the town is redrawn at most every four times the last redraw took, so the turning stays smooth.
* Tests (`test/landmarks.test.ts`) check:
  * a wall encloses the old town and never moves;
  * it comes down only once the town has outgrown it;
  * the church stands on the square;
  * an estate's fields are park;
  * built-over fields are remembered;
  * orchards are only on gentle slopes.

* **The land changing by itself.**
  * **Fords, then bridges.** Where a way crosses a stream it is forded first (dotted stepping stones), bridged in timber once it's a made street, and in stone, with arches, once it's a main street or a made road.
  * **Harbours silt up** 70 days after they're built, by time alone. At first silting was only checked when something was laid, so a town that had stopped growing never silted. The old pier is left stranded and dotted in marsh, with a sand bar across. The boats stop, and the town builds its next harbour at least 0.15 along the shore.
  * **The year's weather.** In winter the snow comes 0.12 down the hills below the snowline and the lakes freeze; in spring the wet meadows flood bluer. It uses the same year of 8 turns as the ploughland.
* **Commons and enclosure.** Every town has a common, the nearest open ground past its square: unhedged, washed as heath, with gorse and a pond, and nothing built on it. At 35 houses it's enclosed, ruled with straight hedges into small fields and farmed, unless somebody tapped it first. Then it stays a green with trees round it, and at 60 houses a park with winding walks.
* **Draining the marsh.** Tap a wet meadow of a town of 15 and it's drained with ruler-straight ditches and a main drain. After 2 days it's ploughland.
* **Places with a life story.**
  * **A castle** at 40 houses, on the highest ground within 0.35: a hatched mound, a six-sided curtain wall with towers and a keep. Nothing is built on its hill. It's a ruin, in broken lines, after 90 days.
  * **An abbey.** Once a town has 30 houses, an abbey stands in the lowest quiet ground (by water if there is any) at least 0.3 from everyone, within 0.9 of the town. It has its church facing east, a cloister, fishponds downhill, and a grange farm down a track. It's a ruin after 100 days.
  * **The road network.**
    * Milestones every 0.07 along the roads.
    * An inn where a road meets another way out in the country.
    * A cemetery outside the walls of a town of 50, with rows of crosses in a dotted enclosure.
    * Canals, along the level, between two towns of 40 within 1.3 of each other. They're pegged out, then dug, with a towpath and a lock at every rise of 0.02.
* **The map itself.**
  * **The survey.** Summits within 0.8 of each other are joined by the fine straight lines of the triangulation, and the limit of the survey, where the blank begins, is finely dotted.
  * **The map matures** over 40 days:
    * its washes grow richer;
    * steep ground is engraved with hachures, closer and longer the steeper;
    * the water is lined along surveyed shores, up to four lines, further apart the further out.
* Tests (`test/history.test.ts`) check:
  * a common stays open and unbuilt until the town encloses it at 35, and never if it was kept;
  * the castle is on the nearest high ground, and nothing is built on it;
  * the abbey stands apart from everyone;
  * a canal's way is continuous;
  * a harbour silts at its own time;
  * the winter and spring floods come round.

## The reveal (ported from whatwesaved)

The pen is the map app's reveal (`marginalia/studio.py`: `plot()`, `ink()`, `draw()`),
moved from a canvas mask onto lines lying on a 3D surface.

What carried over:
* **One pen at constant speed.** A reveal takes as long as there is line to draw, clamped to 1.5–20 s, and it's eased at both ends of the whole run.
* **Nearest-neighbour order** from where you touched, one window at a time. A window is one contour level here, so the terrain still goes on bottom-up. Open lines start at whichever end is nearer.
* **A minimum cost per mark**, so short lines are drawn rather than appearing.
* **A visible nib.**
* **Pen pace**, remembered per viewer.
* **Only new marks are plotted.** A new reveal finishes the running one rather than dropping it.

What's new, to meet this brief's "reshape live":
* While you drag, changed lines show as **pencil**.
* On release, and once any diffusing edits have settled, the pen **inks** them, starting where the stroke began. The pencil stays underneath until the pen reaches it, because a line that disappears and then comes back reads as deletion (whatwesaved PRINCIPLES 21).
* Settings changes redraw with no animation, like the map app's `restate`.

What makes this work: contour extraction is deterministic, so a line the edit didn't touch comes back bit-identical and keeps its key (`lineKey`). There's a test for that, and a stroke measured in the browser changed 24 of 96 lines.

**Where this differs from the map app, on purpose.** The map app doesn't animate the
country: "nobody made the hillside", so drawing it stroke by stroke would say a hand put it
there. Here the terrain is the whole point. It's the player's own object turned into a
world, so the first load plots it in. Only the "only animate the response" rule carries
over, and it applies to the player's edits.

## Staying light

This is meant to be a quick sketchbook, not a heavy engine. What keeps it that way:

* **A small download.** The file loaders (OBJ, PLY, STL, glTF) load only when you open a file of your own. The first load is about 212 KB gzipped, and most of that is Three.js.
* **Coarse worlds.** Specimens are kept under about 12k triangles, and the orange is 11.5k. Ink hides the facets.
* **Redraw only what changed.** The map is built as three layers: town, country and landmarks. Each layer has a key, and it is rebuilt only when its key changes. If nothing changed, the pen does nothing: a full redraw of a grown town now takes about 15 ms, down from 370 ms.
* **Fine detail waits.** Details are drawn only when the world is at rest, not while it grows: hedge trees, ghost hedges, gorse, meadow tufts, roads, the survey and hachures.
* **A quick pen.** The pen picks its next line from a grid of line ends, not by measuring every line. With a grown town, the first ink went from about 1.5 s to 0.27 s. `test/light.test.ts` fails if this becomes slow again.

## Known limits / next steps

* WebGL lines are 1 px. For thicker, pen-like strokes, switch to `Line2` / `LineSegments2` and port the reveal attributes.
* Brush distance is Euclidean. On thin or concave objects it can bleed across gaps, so use geodesic distance (a Dijkstra step on the adjacency) if that matters.
* There's no BVH, and raycasting is brute force. That's fine up to around 50k triangles. Add `three-mesh-bvh` for more.
* Contour rebuilds walk every triangle. Rebuilding only the brushed region would scale better.
