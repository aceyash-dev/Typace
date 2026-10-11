import { useEffect, useRef, useState } from "react";
import { loadFontFace, usableFont } from "../lib/fonts.js";

export default function useVisibleFont(font, enabled = true) {
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || !ref.current || !usableFont(font)) return undefined;
    let active = true;
    let observer;

    const load = () => {
      loadFontFace(font).then((result) => {
        if (active) setLoaded(result);
      });
    };

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      }, { rootMargin: "180px" });
      observer.observe(ref.current);
    } else {
      load();
    }

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [font, enabled]);

  return { ref, loaded };
}
