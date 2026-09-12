"use client";
import { Button } from "@as-tino/ui";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <section className="panel" role="alert"><h1 className="text-xl font-bold">Cette page n'a pas pu se charger.</h1><p className="my-4 text-slate-600">Vos enregistrements confirmés sont conservés. Réessayez ou revenez au tableau de bord.</p><Button onClick={reset}>Réessayer</Button></section>; }
