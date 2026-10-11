import raw from "../../../level/level.json";
import type { Level } from "../../../shared/sim";

/**
 * The UI reads the exact same level/level.json the contract is deployed from.
 * There is no second copy of the obstacle data anywhere in the frontend.
 */
export const LEVEL: Level = raw as Level;
