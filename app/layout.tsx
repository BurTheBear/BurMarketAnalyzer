import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/hooks/use-theme';
const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
export const metadata: Metadata = { title: 'bur market analyzer', icons: {icon:'/bur-bear.png'}, description: 'A considered trading workspace. Live markets, technical confluence, paper trading, and approval-based experimental bots.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" data-theme="light"><body className={`${sans.variable} ${mono.variable}`}><ThemeProvider>{children}</ThemeProvider></body></html>; }
