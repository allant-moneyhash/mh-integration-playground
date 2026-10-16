import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProductGrid } from '@/components/store/product-grid';
import { Banner } from '@/components/banner';

const HERO = [1, 2, 3, 4, 5, 6, 7].map(n => `/images/hero/hero-image-${n}.jpg`);

export default function Home() {
  return (
    <>
      <div className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-24 sm:px-6 sm:pt-24 lg:px-8 lg:pb-40">
          <div className="relative z-10 sm:max-w-lg lg:max-w-md">
            <h1 className="text-4xl font-bold tracking-tight text-bolder sm:text-6xl">
              See every call, live.
            </h1>
            <p className="mt-4 text-xl text-subtle">
              Shop as usual, pick how the store integrates with MoneyHash, and
              watch each request and response as it happens.
            </p>
            <Button asChild size="lg" className="mt-10">
              <Link href="#shop-sections">Shop collection</Link>
            </Button>
          </div>
          <div
            aria-hidden
            className="pointer-events-none mt-12 hidden lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:flex lg:w-1/2 lg:items-center"
          >
            <div className="flex items-center gap-6 lg:gap-8">
              {[HERO.slice(0, 2), HERO.slice(2, 5), HERO.slice(5, 7)].map(
                (col, i) => (
                  <div key={i} className="grid shrink-0 gap-6 lg:gap-8">
                    {col.map(src => (
                      <Image
                        key={src}
                        src={src}
                        alt=""
                        width={176}
                        height={256}
                        className="h-64 w-44 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      <ProductGrid />
      <Banner />
    </>
  );
}
