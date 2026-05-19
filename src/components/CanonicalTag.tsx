import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

/**
 * Emits a per-route <link rel="canonical"> pointing at the canonical
 * https://naitive.co origin. Overrides the static canonical in index.html.
 */
export function CanonicalTag() {
  const { pathname } = useLocation();
  const href = `https://naitive.co${pathname === "/" ? "/" : pathname}`;
  return (
    <Helmet>
      <link rel="canonical" href={href} />
    </Helmet>
  );
}

export default CanonicalTag;