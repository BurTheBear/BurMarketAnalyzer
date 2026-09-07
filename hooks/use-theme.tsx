'use client';
import { createContext,useContext,useEffect,useState } from 'react';
export const THEMES={light:{name:'Light',colors:['#f6f5f2','#ffffff','#765c44']},dark:{name:'Dark',colors:['#141619','#202328','#dbbd9c']},espresso:{name:'Espresso',colors:['#191411','#3b2b1f','#d3ad82']},walnut:{name:'Walnut',colors:['#251b18','#50352c','#dfad88']},sand:{name:'Sand',colors:['#eee3d2','#d9c5a7','#795332']},midnight:{name:'Midnight',colors:['#101722','#253447','#8bbad0']}};
export type Theme=keyof typeof THEMES;
const ThemeContext=createContext<{theme:Theme;setTheme:(theme:Theme)=>void}>({theme:'light',setTheme:()=>{}});
export function ThemeProvider({children}:{children:React.ReactNode}){
 const [theme,setTheme]=useState<Theme>('light'),[ready,setReady]=useState(false);
 useEffect(()=>{try{const saved=localStorage.getItem('bur-theme');if(saved&&Object.hasOwn(THEMES,saved))setTheme(saved as Theme);}catch{}setReady(true);},[]);
 useEffect(()=>{if(!ready)return;document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('dark',theme!=='light'&&theme!=='sand');try{localStorage.setItem('bur-theme',theme);}catch{}window.dispatchEvent(new Event('bur-theme'));},[theme,ready]);
 return <ThemeContext.Provider value={{theme,setTheme}}>{children}</ThemeContext.Provider>;
}
export const useTheme=()=>useContext(ThemeContext);
