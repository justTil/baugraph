/**
 * A GIF89a encoder.
 *
 * Written out rather than pulled in. The format has not changed since 1989, and
 * the two parts of it that are actually interesting — choosing 256 colours, and
 * LZW — are a page each. A diagram happens to be the easiest thing in the world
 * to encode: flat fills quantise exactly, and between one frame and the next
 * almost nothing moves. So every frame after the first is written as the small
 * rectangle that changed, with the rest left transparent and inherited from the
 * frame underneath — which is what keeps an exported animation in the tens of
 * kilobytes instead of the tens of megabytes.
 *
 * Frames are handed over one at a time and encoded on the spot. Holding a
 * hundred frames of pixels to encode at the end would cost hundreds of
 * megabytes, and the encoder never needs more than the frame before this one.
 */

/** A colour packed into a single number, which is what a histogram is keyed by. */
const packed = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b

/* -------------------------------------------------------------- quantising */

/** The three channels, as the shift that reaches each one. */
const CHANNELS = [16, 8, 0]

/** The channel a set of colours is most spread across — the one worth cutting. */
function widest(box: number[]): { shift: number; spread: number } {
  let shift = 16
  let spread = -1
  for (const channel of CHANNELS) {
    let low = 255
    let high = 0
    for (const color of box) {
      const value = (color >> channel) & 255
      if (value < low) low = value
      if (value > high) high = value
    }
    if (high - low > spread) {
      spread = high - low
      shift = channel
    }
  }
  return { shift, spread }
}

/** The colour a set of them averages out to, weighted by how often each occurs. */
function average(box: number[], counts: Map<number, number>): number {
  let r = 0
  let g = 0
  let b = 0
  let total = 0
  for (const color of box) {
    const weight = counts.get(color) ?? 1
    r += ((color >> 16) & 255) * weight
    g += ((color >> 8) & 255) * weight
    b += (color & 255) * weight
    total += weight
  }
  return packed(Math.round(r / total), Math.round(g / total), Math.round(b / total))
}

/**
 * Median cut: start with every colour in one box, and repeatedly split whichever
 * box covers the most ground across its widest channel, at the point half its
 * pixels fall either side of. The boxes that come out are small where the image
 * has detail and large where it does not, which for a diagram means the flat
 * fills and the type keep their exact colours and the antialiasing shares
 * whatever is left.
 */
function quantize(counts: Map<number, number>, max: number): number[] {
  const all = [...counts.keys()]
  if (all.length <= max) return all

  const weigh = (box: number[]) => box.reduce((sum, c) => sum + (counts.get(c) ?? 1), 0)
  const boxes: number[][] = [all]

  while (boxes.length < max) {
    let pick = -1
    let score = 0
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!
      if (box.length < 2) continue
      // Spread against population, damped: a box holding half the image earns a
      // split, but not against one holding a tenth of it and twice the range.
      const value = widest(box).spread * Math.cbrt(weigh(box))
      if (value > score) {
        score = value
        pick = i
      }
    }
    if (pick < 0) break

    const box = boxes[pick]!
    const { shift } = widest(box)
    box.sort((a, b) => ((a >> shift) & 255) - ((b >> shift) & 255))

    const total = weigh(box)
    let running = 0
    let cut = 0
    for (const color of box) {
      running += counts.get(color) ?? 1
      cut++
      if (running * 2 >= total) break
    }
    cut = Math.min(Math.max(cut, 1), box.length - 1)
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut))
  }

  return boxes.map((box) => average(box, counts))
}

/**
 * The colour table an animation is drawn in, as RGB triples.
 *
 * Built from a handful of frames rather than all of them: the palette a diagram
 * needs is settled by the frame the messages happen not to be in, and sampling
 * a few moments of the animation catches every colour a message adds.
 */
export function gifPalette(samples: Uint8ClampedArray[], max = 255): Uint8Array {
  const counts = new Map<number, number>()
  for (const rgba of samples) {
    for (let i = 0; i < rgba.length; i += 4) {
      const key = packed(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const colors = quantize(counts, Math.max(2, Math.min(255, max)))
  const table = new Uint8Array(colors.length * 3)
  colors.forEach((color, i) => {
    table[i * 3] = (color >> 16) & 255
    table[i * 3 + 1] = (color >> 8) & 255
    table[i * 3 + 2] = color & 255
  })
  return table
}

/* ------------------------------------------------------------------ bytes */

/** A growable byte buffer, since a GIF's length is only known once it is built. */
function sink() {
  let data = new Uint8Array(1 << 16)
  let length = 0

  const room = (n: number) => {
    if (length + n <= data.length) return
    let size = data.length
    while (size < length + n) size *= 2
    const grown = new Uint8Array(size)
    grown.set(data.subarray(0, length))
    data = grown
  }

  return {
    byte(value: number) {
      room(1)
      data[length++] = value & 255
    },
    /** Two bytes, least significant first, as every field in a GIF is written. */
    word(value: number) {
      room(2)
      data[length++] = value & 255
      data[length++] = (value >> 8) & 255
    },
    ascii(text: string) {
      room(text.length)
      for (let i = 0; i < text.length; i++) data[length++] = text.charCodeAt(i) & 255
    },
    block(source: Uint8Array) {
      room(source.length)
      data.set(source, length)
      length += source.length
    },
    done: () => data.slice(0, length),
  }
}

/** Codes are packed least significant bit first, and straddle byte boundaries. */
function bitWriter() {
  const out = sink()
  let current = 0
  let bits = 0

  return {
    write(code: number, size: number) {
      current |= code << bits
      bits += size
      while (bits >= 8) {
        out.byte(current)
        current >>>= 8
        bits -= 8
      }
    },
    finish(): Uint8Array {
      if (bits > 0) out.byte(current)
      return out.done()
    },
  }
}

/**
 * GIF's variable-width LZW.
 *
 * The dictionary starts as the palette itself and grows a code per novel pair
 * seen, widening from `min + 1` bits to twelve as it fills and starting over
 * once it is full. The decoder rebuilds the same dictionary from the same
 * stream, so the only thing the encoder has to get right is *when* the width
 * changes: one code too early or late and everything after it is noise.
 */
function lzw(indices: Uint8Array, min: number): Uint8Array {
  const out = bitWriter()
  const clear = 1 << min
  const end = clear + 1

  let table = new Map<number, number>()
  let next = end + 1
  let size = min + 1

  out.write(clear, size)
  if (!indices.length) {
    out.write(end, size)
    return out.finish()
  }

  let prefix = indices[0]!
  for (let i = 1; i < indices.length; i++) {
    const value = indices[i]!
    const key = (prefix << 8) | value
    const known = table.get(key)
    if (known !== undefined) {
      prefix = known
      continue
    }

    out.write(prefix, size)
    if (next === 4096) {
      out.write(clear, size)
      table = new Map()
      next = end + 1
      size = min + 1
    } else {
      // Widened just before the code that would not fit is handed out, which is
      // the moment the decoder widens too.
      if (next >= 1 << size) size++
      table.set(key, next++)
    }
    prefix = value
  }

  out.write(prefix, size)
  out.write(end, size)
  return out.finish()
}

/* ------------------------------------------------------------------ frames */

export interface GifWriter {
  /** Adds one frame, as RGBA at the size the animation was opened at. */
  add(rgba: Uint8ClampedArray): void
  // Spelt out over its buffer so the bytes can go straight into a `Blob`, which
  // will not take a view that might be over shared memory.
  finish(): Uint8Array<ArrayBuffer>
}

export interface GifOptions {
  width: number
  height: number
  /** RGB triples, at most 255 of them; see `gifPalette`. */
  palette: Uint8Array
  /** Hundredths of a second each frame is held for. */
  delay: number
  loop?: boolean
}

export function gifWriter({ width, height, palette, delay, loop = true }: GifOptions): GifWriter {
  const colors = palette.length / 3
  // One slot past the colours is spent on transparency, which is what lets a
  // frame say "unchanged here" and inherit the pixel underneath.
  const blank = colors

  let bits = 2
  while (1 << bits < colors + 1 && bits < 8) bits++
  const size = 1 << bits

  const out = sink()

  out.ascii('GIF89a')
  out.word(width)
  out.word(height)
  // Global colour table, eight bits of colour resolution, and its size.
  out.byte(0x80 | 0x70 | (bits - 1))
  out.byte(0)
  out.byte(0)

  const table = new Uint8Array(size * 3)
  table.set(palette.subarray(0, Math.min(palette.length, table.length)))
  out.block(table)

  if (loop) {
    // The Netscape extension, which is how a GIF has said "repeat forever" for
    // thirty years despite never having been part of the specification.
    out.byte(0x21)
    out.byte(0xff)
    out.byte(0x0b)
    out.ascii('NETSCAPE2.0')
    out.byte(0x03)
    out.byte(0x01)
    out.word(0)
    out.byte(0x00)
  }

  /** Nearest palette entry, cached: a diagram asks about the same few thousand. */
  const cache = new Map<number, number>()
  const nearest = (key: number): number => {
    const hit = cache.get(key)
    if (hit !== undefined) return hit

    const r = (key >> 16) & 255
    const g = (key >> 8) & 255
    const b = key & 255
    let best = 0
    let closest = Infinity
    for (let i = 0; i < palette.length; i += 3) {
      const dr = r - palette[i]!
      const dg = g - palette[i + 1]!
      const db = b - palette[i + 2]!
      const distance = dr * dr + dg * dg + db * db
      if (distance < closest) {
        closest = distance
        best = i / 3
        if (!distance) break
      }
    }
    cache.set(key, best)
    return best
  }

  let previous: Uint8Array | null = null

  return {
    add(rgba) {
      const frame = new Uint8Array(width * height)
      for (let p = 0, i = 0; p < frame.length; p++, i += 4) {
        frame[p] = nearest(packed(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!))
      }

      let left = 0
      let top = 0
      let w = width
      let h = height
      let data = frame

      if (previous) {
        // The rectangle that actually changed. On a diagram that is the strip a
        // message moved along, which is a fraction of a percent of the picture.
        let x0 = width
        let y0 = height
        let x1 = -1
        let y1 = -1
        for (let y = 0; y < height; y++) {
          const row = y * width
          for (let x = 0; x < width; x++) {
            if (frame[row + x] === previous[row + x]) continue
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
        // Nothing moved. A GIF cannot hold no image at all, so it holds one
        // transparent pixel, which draws nothing over what is already there.
        if (x1 < 0) {
          x0 = 0
          y0 = 0
          x1 = 0
          y1 = 0
        }

        left = x0
        top = y0
        w = x1 - x0 + 1
        h = y1 - y0 + 1
        data = new Uint8Array(w * h)
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const at = (top + y) * width + left + x
            data[y * w + x] = frame[at] === previous[at] ? blank : frame[at]!
          }
        }
      }

      // Graphic control: leave the frame in place when the next one arrives, so
      // the transparent parts of that one show this one through.
      out.byte(0x21)
      out.byte(0xf9)
      out.byte(0x04)
      out.byte(0x05)
      out.word(delay)
      out.byte(blank)
      out.byte(0x00)

      out.byte(0x2c)
      out.word(left)
      out.word(top)
      out.word(w)
      out.word(h)
      out.byte(0x00)

      out.byte(bits)
      const stream = lzw(data, bits)
      for (let i = 0; i < stream.length; i += 255) {
        const chunk = stream.subarray(i, Math.min(i + 255, stream.length))
        out.byte(chunk.length)
        out.block(chunk)
      }
      out.byte(0x00)

      previous = frame
    },

    finish() {
      out.byte(0x3b)
      return out.done()
    },
  }
}
