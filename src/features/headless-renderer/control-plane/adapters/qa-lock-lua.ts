/**
 * Fixed Lua scripts for QA exclusivity lock ownership (EVAL only).
 * Shared by FakeRedis + Memory + TCP QA adapters — not production barrels.
 */

/** Compare-and-delete: DEL only when GET matches token. */
export const QA_LOCK_COMPARE_AND_DELETE_LUA =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

/** Compare-and-renew: PEXPIRE only when GET matches token. */
export const QA_LOCK_COMPARE_AND_RENEW_LUA =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end";
