import { readFileSync } from "fs";

export const key = readFileSync(__dirname + '/test_key.pem');
