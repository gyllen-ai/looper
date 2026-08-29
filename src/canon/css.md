Writing CSS and Sass, and the styles inside a page or a Razor component. The law
refuses
`!important`, a negative margin, a z-index past the cap, a colour written
anywhere but the palette file, and a `style=` attribute on an element; these are
the failures it cannot see.

- **The cascade has already decided. Read what beat you before you fight it.**
  The selector that won is findable, and moving the declaration to where it
  already wins costs less than every override after it.
- **A colour, a space and a layer are the same kind of fact: one home, and
  everything else points at it by name.** `ui/assets` argues why.
- **A box is placed by what contains it.** Reaching out of one box to shove the
  next one is the repair that outlives the reason for it, and the distance then
  lives in neither rule.
- **Judge it by looking at it, at the size it will be used** — that is
  `frontend`, and no rule here can do it for you.
