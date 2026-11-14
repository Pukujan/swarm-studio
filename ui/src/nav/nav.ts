// Where the person is: the same XState machine the current Studio runs (web/nav.js, docs/specs/34-navigation-state.md),
// imported, not copied, so both apps take the same moves and read and write the same address.
export { makeNav, view, toAddress } from '@studio/nav'
export type { Nav, NavEvent, Room, View } from '@studio/nav'
import type { View } from '@studio/nav'

// two views are the same screen when every field is (makeNav's own test, for useSelector)
export const sameView = (a: View, b: View) => (Object.keys(a) as (keyof View)[]).every(k => a[k] === b[k])
