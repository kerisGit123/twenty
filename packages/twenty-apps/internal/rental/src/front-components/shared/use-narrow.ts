import { useEffect, useState } from 'react';

// True on a phone-sized (or small tablet) window, so wide tables can become
// cards. The sandbox reports the window width; it is read again every second
// and on resize, and only re-renders when the answer changes.
export const useNarrow = (limit = 820) => {
  const read = () => {
    const width = Number((globalThis as { innerWidth?: number }).innerWidth);

    return width > 0 && width < limit;
  };
  const [narrow, setNarrow] = useState(read);

  useEffect(() => {
    const update = () => setNarrow(read());
    const timer = setInterval(update, 1000);

    update();

    return () => clearInterval(timer);
  }, [limit]);

  return narrow;
};
