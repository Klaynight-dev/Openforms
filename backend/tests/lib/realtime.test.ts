import { describe, expect, test } from "bun:test";
import { editorStateOf } from "../../src/lib/realtime.ts";

describe("editorStateOf", () => {
  test("diffuse l'état éditable et rien d'autre", () => {
    const state = editorStateOf({
      id: "f1",
      title: "Enquête",
      schema: [{ key: "q1" }],
      isPublished: true,
      exportTheme: { logoDataUrl: "data:image/png;base64,AAAA" },
      rotationCounter: 42,
      ownerId: "u1",
    });
    expect(state).toEqual({ title: "Enquête", schema: [{ key: "q1" }], isPublished: true });
  });
});
