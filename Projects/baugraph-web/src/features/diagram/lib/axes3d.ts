/**
 * The 3D view's axes, by name and colour — apart from `transform3d.ts` so the
 * inspector can label its fields without pulling in three.js, which nobody who
 * stays in 2D should download.
 *
 * Named the way the file names them: `x` and `y` are the canvas's own axes and
 * `z` is height.
 */

export type Axis = 'x' | 'y' | 'z'
export const AXES: readonly Axis[] = ['x', 'y', 'z']

/**
 * Axis colours, the convention every 3D tool shares: red, green, blue for x,
 * y, z — so a constraint reads the same here as anywhere else.
 */
export const AXIS_COLOR: Readonly<Record<Axis, string>> = {
  x: '#f0384f',
  y: '#7fc31c',
  z: '#2f86eb',
}
