import {
  f,
  m
} from "./chunk-XOKJD5BU.js";
import {
  e
} from "./chunk-F4HVXQTU.js";
import {
  P,
  W
} from "./chunk-SASSF2KW.js";
import {
  __async
} from "./chunk-WDMUDEB6.js";

// ../node_modules/@ionic/core/components/p-CneGxKsZ.js
var n = () => {
  const n2 = window;
  n2.addEventListener("statusTap", (() => {
    W((() => {
      const o = document.elementFromPoint(n2.innerWidth / 2, n2.innerHeight / 2);
      if (!o) return;
      const e2 = f(o);
      e2 && new Promise(((o2) => e(e2, o2))).then((() => {
        P((() => __async(null, null, function* () {
          e2.style.setProperty("--overflow", "hidden"), yield m(e2, 300), e2.style.removeProperty("--overflow");
        })));
      }));
    }));
  }));
};
export {
  n as startStatusTap
};
//# sourceMappingURL=p-CneGxKsZ-DLHUR6FS.js.map
