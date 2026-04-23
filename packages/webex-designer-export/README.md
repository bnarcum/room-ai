# webex-designer-export

Pure TypeScript helper that turns **Room Vision** dimension analysis into **Cisco Webex Workspace Designer** [Custom rooms](https://designer.webex.com/#/article/CustomRooms) JSON.

## Usage

```ts
import {
  buildWebexDesignerRoomJson,
  webexDesignerJsonFileName,
} from "webex-designer-export";

const doc = buildWebexDesignerRoomJson(roomAnalysis);
const filename = webexDesignerJsonFileName(doc.title);
```

Import the downloaded file in **Workspace Designer** by dragging it onto the **3D view** (see Cisco article).

## What gets generated

- `roomShape.manual` rectangle using estimated **length / width / height** converted to **meters**.
- Starter `customObjects`: rectangular **table**, **Room Bar Pro**, **75″ singleScreen**, **Table Mic Pro**, and **chairs** around the table (count derived from `roomSummary.occupancy`, clamped 2–8).

This is a starting layout for iteration in Designer, not a full equipment recommendation engine.

## Relationship to `collabExperienceExport`

The main **room-ai** app also builds **Video Room Calculator** `.vrc.json` for collabexperience.com. That format is unrelated to Webex JSON—this package targets **designer.webex.com** only.
