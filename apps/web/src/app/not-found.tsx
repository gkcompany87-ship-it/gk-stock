import Link from "next/link";
export default function NotFound() { return <section className="panel"><h1 className="text-xl font-bold">Page introuvable</h1><p className="my-4">Cette adresse n'existe pas.</p><Link href="/" className="text-teal-700 underline">Revenir au tableau de bord</Link></section>; }
