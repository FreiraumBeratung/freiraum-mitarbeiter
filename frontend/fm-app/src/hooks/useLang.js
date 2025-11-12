import de from "../lang/de.json";

export function useLang(){
  const dict = de;
  return (key) => dict[key] || key;
}
















