import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Snow Seasons Tech | Customer Portal', description: 'Your workspace for intelligent business applications and managed services.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
