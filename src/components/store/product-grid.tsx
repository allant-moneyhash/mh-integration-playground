'use client';
import { useState } from 'react';
import Image from 'next/image';
import {
  CheckIcon,
  ShieldCheckIcon,
  StarIcon,
} from '@heroicons/react/20/solid';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/overlays';
import { formatMoney, productSections, type Product } from '@/lib/catalog';
import { useCart } from '@/store/cart';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/cn';

export function ProductGrid() {
  const hydrated = useHydrated();
  const currency = useCart(s => s.currency);
  const add = useCart(s => s.add);
  const [selected, setSelected] = useState<Product | null>(null);
  const shown = hydrated ? currency : 'AED';

  return (
    <main
      id="shop-sections"
      className="mx-auto max-w-7xl space-y-20 px-4 pb-32 sm:px-6 lg:px-8"
    >
      {productSections.map(section => (
        <section key={section.category} id={section.category}>
          <h2 className="text-2xl font-bold tracking-tight text-bolder">
            {section.category}
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {section.products.map(p => (
              <button
                key={p.id}
                className="group text-left"
                onClick={() => setSelected(p)}
              >
                <Image
                  src={p.imageSrc}
                  alt={p.imageAlt}
                  width={400}
                  height={400}
                  className="aspect-square w-full rounded-md bg-muted/20 object-cover group-hover:opacity-80 lg:h-80"
                />
                <div className="mt-4 flex justify-between">
                  <div>
                    <h3 className="text-sm font-medium">{p.name}</h3>
                    <p className="mt-1 text-sm text-subtle">{p.color}</p>
                  </div>
                  <p className="text-sm font-medium">
                    {formatMoney(p.price[shown], shown)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-2xl">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
              <Image
                src={selected.imageSrc}
                alt={selected.imageAlt}
                width={400}
                height={400}
                className="aspect-square w-full rounded-lg bg-muted/20 object-cover sm:col-span-5"
              />
              <div className="space-y-4 sm:col-span-7">
                <DialogTitle className="text-2xl font-bold text-bolder">
                  {selected.name}
                </DialogTitle>
                <p className="text-2xl">
                  {formatMoney(selected.price[shown], shown)}
                </p>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map(r => (
                    <StarIcon
                      key={r}
                      className={cn(
                        'size-5',
                        selected.rating >= r
                          ? 'text-yellow-400'
                          : 'text-gray-200',
                      )}
                    />
                  ))}
                </div>
                <DialogDescription className="text-sm text-subtle">
                  {selected.description}
                </DialogDescription>
                <p className="flex items-center gap-1 text-sm">
                  <CheckIcon className="size-5 text-green-500" /> In stock and
                  ready to ship
                </p>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    add(selected.id);
                    toast.success(`${selected.name} added to your bag`);
                    setSelected(null);
                  }}
                >
                  Add to bag
                </Button>
                <p className="flex items-center justify-center gap-1 text-sm text-subtle">
                  <ShieldCheckIcon className="size-5" /> Lifetime guarantee
                </p>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
