/**
 * Fixed instruction bundle for turning Workspace Designer exports into photorealistic dollhouse views.
 * Sent to OpenAI Images `edits` with the uploaded render as reference (geometry preserved).
 */

export const DESIGNER_PHOTOREALISTIC_PROMPT = `Make the 3D model look photorealistic by improving lighting, materials, textures, and color accuracy without changing any geometry or object design.

Environment details:
- Floor: concrete
- Carpet: brown
- Walls: pleasant light ocean blue
- Table: light oak
- Chairs: white with wood legs
- Window frames: black
- Window on the left looks out toward a garden
- Make the curtains white slightly transparent textile

People:
Add diverse business casual people

Style and framing:
Keep the dollhouse style with no ceiling, showing only two walls and the floor. A white background should replace transparent areas.`;
