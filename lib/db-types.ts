import { customType } from "drizzle-orm/pg-core";
import { validate as validateUuidv7 } from "./uuidv7";
import type { Id, UuidString } from "./id";

const uuidv7Type = customType<{ data: string; driverData: string }>({
  dataType() {
    return "uuid";
  },
  toDriver(value) {
    if (!validateUuidv7(value)) throw new Error(`${value} is not a valid UUIDv7`);
    return value;
  },
  fromDriver(value) {
    return value;
  },
});

export function id<T extends Id<string> | UuidString = UuidString>() {
  return uuidv7Type().$type<T>();
}

export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});
