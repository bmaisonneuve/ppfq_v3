import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { nationalityFlags } from '@/server/db/schema'

/**
 * Reads the bytes of one flag.
 *
 * The only read path to `nationality_flags`, and deliberately the whole of this
 * service: the flags are *written* by `scripts/flags.ts`, a bootstrap that runs
 * under plain Node at deploy time like the referential import, not by the
 * application. So there is no write half here to keep honest.
 *
 * The bytes are selected explicitly and never as `select(nationalityFlags)`:
 * the point of putting them in their own table was that nothing reads them by
 * accident, and a `select *` here would be the place that undoes it.
 */
export type StoredFlag = {
  bytes: Buffer
  contentType: string
}

export async function readFlag(key: string): Promise<StoredFlag | null> {
  const [row] = await db
    .select({ bytes: nationalityFlags.bytes, contentType: nationalityFlags.contentType })
    .from(nationalityFlags)
    .where(eq(nationalityFlags.key, key))
    .limit(1)

  return row ?? null
}
