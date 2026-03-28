import { useEffect, useState } from "react";

import { loadLocal, saveLocal } from "../lib/storage";

export function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => loadLocal(key, fallback));

  useEffect(() => {
    saveLocal(key, value);
  }, [key, value]);

  return [value, setValue];
}
