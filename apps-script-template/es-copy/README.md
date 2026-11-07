# The script in an ES's copy of the WiSH sheet

`Loader.gs` and `appsscript.json` here are the whole Apps Script project in the WiSH template
sheet that each ES copies. They never need changing.

- The loader runs the rest of WiSH (the engine) from `es-engine/Code.gs` in this repo, keeps a
  copy in the ES's Drive (next to their sheet), and checks for a newer engine every hour.
- A new engine is only used if it reads as code, has a blank admin password and a
  `WORKIT_VERSION`. The previous engine is kept and used if the new one won't start.
- `appsscript.json` already asks for every permission WiSH uses. An engine that needs a new
  one would make every ES approve again, so avoid that.
- Only the function names in `Loader.gs` can be web app entry points, menu items or timers.
  Engine timers must use `wishTick`; extra menu items go through `WISH_MENU` (see `menuItems_`).

## Releasing an update to every ES

`es-engine/Code.gs` is what ES copies run. It only changes on purpose, as the last step of
"update WiSH school", once Joon's school copy is on the same version:

    apps-script-template/release-es-engine.sh   # copies Code.gs to es-engine/, with checks
    git add es-engine && git commit && git push origin main

Every ES copy picks it up within the hour. To roll back, release the earlier Code.gs the same way.
