'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_BOT_PARAMETERS, validBotParameters, type BotParameters } from '@/lib/engine/bot-policy';
export function useBotParameters() {
 const [parameters,setParameters]=useState<BotParameters>(DEFAULT_BOT_PARAMETERS),[ready,setReady]=useState(false);
 useEffect(()=>{try {const stored=JSON.parse(localStorage.getItem('bur-bot-parameters')??'null');if(validBotParameters(stored))setParameters(stored);}catch{}setReady(true);},[]);
 useEffect(()=>{if(ready)localStorage.setItem('bur-bot-parameters',JSON.stringify(parameters));},[parameters,ready]);
 return [parameters,setParameters] as const;
}
