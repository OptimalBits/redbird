import { readFileSync } from "fs";

export const certificate = readFileSync(__dirname + '/test_crt.pem');
