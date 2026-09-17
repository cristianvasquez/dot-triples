import { mediaFragment } from './terms.js'

// The containment rule: which group holds which node.
//
// JSON Canvas has no membership field, so this is the one relation a canvas
// does not state and the triplifier computes. It lives in its own file because
// it is a rule, not a reading of the format: the geometry below is the whole
// definition of `dct:hasPart` on a canvas, and it is meant to be replaced by a
// proper implementation without touching the rest of the triplifier.
//
// Known limits of this version, kept as they are on purpose:
//  - two groups with the same rectangle hold each other, so nesting is not
//    always a tree;
//  - a tie between two containers of equal area is broken by file order, so
//    the node order in the JSON can change the output;
//  - a degenerate rectangle (zero or negative size) is not rejected;
//  - a node that sticks out of a group, by one pixel or by half, is in no
//    group and says nothing.

// Geometric containment. Touching edges count as inside, as Obsidian draws it.
export function contains (group, node) {
  if (group.id === node.id) return false
  if (!mediaFragment(group) || !mediaFragment(node)) return false
  return node.x >= group.x &&
    node.y >= group.y &&
    node.x + node.width <= group.x + group.width &&
    node.y + node.height <= group.y + group.height
}

export function area (node) {
  return Number(node.width) * Number(node.height)
}

// Each entry of `placed` is a node the canvas draws: `{ node, anchor, term }`,
// the node as the file gives it, its anchor, and what it denotes -- the note
// behind a `file` node, the URL behind a `link` node, the anchor itself for a
// text card or a group.
//
// Returns `[holder, part]` pairs. The holder is the group anchor, because a
// group denotes itself. The part is what the node denotes, so a note dropped
// in a group is held as the note, not as the rectangle that draws it; the
// anchor already names the canvas as its source.
//
// Each node is a part of the smallest group that holds it, so nested groups
// nest and the rest is the transitive closure. A node in no group gets
// nothing: the canvas already lists it with schema:about.
export function containment (placed) {
  const groups = placed.filter(({ node }) => node.type === 'group' && mediaFragment(node))
  const pairs = []

  for (const { node, term } of placed) {
    const containers = groups.filter(group => contains(group.node, node))
    if (!containers.length) continue

    const smallest = containers.reduce((a, b) => (area(b.node) < area(a.node) ? b : a))
    pairs.push([smallest.anchor, term])
  }

  return pairs
}
