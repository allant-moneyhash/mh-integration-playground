// Product catalog and test cards ported from shop.moneyhash.io
// (src/utils/productSections.ts, src/utils/testCards.ts).

export const CURRENCIES = ['USD', 'EGP', 'SAR', 'AED', 'KWD', 'ZAR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_DECIMALS: Record<Currency, number> = {
  USD: 2,
  EGP: 2,
  SAR: 2,
  AED: 2,
  KWD: 3,
  ZAR: 2,
};

export type Product = {
  id: string;
  category: 'Shirts' | 'Bags';
  name: string;
  color: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  price: Record<Currency, number>;
  rating: 1 | 2 | 3 | 4 | 5;
};

export const products: Product[] = [
  {
    id: 'basic-tee-black',
    category: 'Shirts',
    name: 'Basic Tee',
    color: 'Black',
    description:
      'A wardrobe essential crafted from soft, breathable cotton. The classic black colorway offers effortless versatility.',
    imageSrc: '/images/products/product-page-01-related-product-01.png',
    imageAlt: "Front of men's Basic Tee in black.",
    price: { USD: 35, EGP: 1000, SAR: 90, AED: 90, KWD: 10, ZAR: 650 },
    rating: 5,
  },
  {
    id: 'basic-tee-white',
    category: 'Shirts',
    name: 'Basic Tee',
    color: 'Aspen White',
    description:
      'A clean, minimalist tee in a soft off-white tone. Lightweight cotton for all-day comfort.',
    imageSrc: '/images/products/product-page-01-related-product-02.png',
    imageAlt: "Front of men's Basic Tee in white.",
    price: { USD: 35, EGP: 1000, SAR: 85, AED: 80, KWD: 9, ZAR: 650 },
    rating: 5,
  },
  {
    id: 'basic-tee-charcoal',
    category: 'Shirts',
    name: 'Basic Tee',
    color: 'Charcoal',
    description:
      'The same everyday essential in a rich charcoal gray. A neutral that pairs with everything.',
    imageSrc: '/images/products/product-page-01-related-product-03.png',
    imageAlt: "Front of men's Basic Tee in dark gray.",
    price: { USD: 35, EGP: 1000, SAR: 95, AED: 100, KWD: 11, ZAR: 650 },
    rating: 3,
  },
  {
    id: 'artwork-tee',
    category: 'Shirts',
    name: 'Artwork Tee',
    color: 'Charcoal',
    description:
      'A statement tee featuring an isometric cube graphic made of delicate dots on a soft peach background.',
    imageSrc: '/images/products/product-page-01-related-product-04.png',
    imageAlt:
      "Front of men's Artwork Tee in peach with dots forming an isometric cube.",
    price: { USD: 35, EGP: 1000, SAR: 70, AED: 65, KWD: 7, ZAR: 650 },
    rating: 4,
  },
  {
    id: 'nomad-pouch',
    category: 'Bags',
    name: 'Nomad Pouch',
    color: 'White and Black',
    description:
      'A compact travel pouch in white fabric with a smooth zipper and black elastic loop.',
    imageSrc: '/images/products/category-page-07-product-01.png',
    imageAlt: 'White fabric pouch with white zipper and black elastic loop.',
    price: { USD: 50, EGP: 1500, SAR: 95, AED: 100, KWD: 12, ZAR: 900 },
    rating: 4,
  },
  {
    id: 'zip-tote-basket',
    category: 'Bags',
    name: 'Zip Tote Basket',
    color: 'Washed Black',
    description:
      'A structured tote with a washed black canvas body and tan leather handles. Spacious enough for work or weekend.',
    imageSrc: '/images/products/category-page-07-product-02.png',
    imageAlt: 'Tote bag with washed black canvas body and tan leather handles.',
    price: { USD: 140, EGP: 4000, SAR: 75, AED: 80, KWD: 9, ZAR: 2500 },
    rating: 5,
  },
  {
    id: 'medium-stuff-satchel',
    category: 'Bags',
    name: 'Medium Stuff Satchel',
    color: 'Blue',
    description:
      'A bold blue satchel with a drawstring top, front zipper pouch, and sturdy black straps.',
    imageSrc: '/images/products/category-page-07-product-03.png',
    imageAlt: 'Satchel with blue canvas body, black straps and drawstring top.',
    price: { USD: 220, EGP: 6400, SAR: 65, AED: 70, KWD: 8, ZAR: 4000 },
    rating: 5,
  },
  {
    id: 'high-wall-tote',
    category: 'Bags',
    name: 'High Wall Tote',
    color: 'Black and Orange',
    description:
      'A high-capacity tote in black canvas with an orange drawstring top and robust handles.',
    imageSrc: '/images/products/category-page-07-product-04.png',
    imageAlt: 'Zip tote bag with black canvas and orange drawstring top.',
    price: { USD: 210, EGP: 6200, SAR: 82, AED: 50, KWD: 7, ZAR: 3800 },
    rating: 4,
  },
];

export const productSections = (['Shirts', 'Bags'] as const).map(category => ({
  category,
  products: products.filter(p => p.category === category),
}));

export function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: CURRENCY_DECIMALS[currency],
  }).format(amount);
}

export type TestCardSet = {
  providerName: string;
  docsLink: string;
  frictionless: string;
  challenge: string;
  failed?: string;
  note?: string;
};

const checkoutCom: TestCardSet = {
  providerName: 'Checkout.com',
  docsLink:
    'https://www.checkout.com/docs/developer-resources/testing/test-cards',
  frictionless: '5436031030606378',
  challenge: '4242424242424242',
  failed: '4150561000000019',
};

export const testCards: Record<Currency, TestCardSet> = {
  EGP: checkoutCom,
  SAR: checkoutCom,
  USD: {
    providerName: 'Stripe',
    docsLink: 'https://docs.stripe.com/testing',
    frictionless: '5555555555554444',
    challenge: '4000000000003220',
    failed: '4000000000000002',
  },
  AED: {
    providerName: 'Amazon Payment Services',
    docsLink: 'https://paymentservices.amazon.com/docs/EN/12.html',
    frictionless: '5123456789012346',
    challenge: '5123450000000008',
    failed: '5455031252665454',
  },
  KWD: {
    providerName: 'Tap',
    docsLink: 'https://developers.tap.company/reference/testing-cards',
    frictionless: '4012000033330026',
    challenge: '5123450000000008',
    note: 'Use 01/39 as expiry. CVV 100 is valid, 101 is invalid.',
  },
  ZAR: {
    providerName: 'Peach Payments',
    docsLink:
      'https://developer.peachpayments.com/docs/reference-test-and-go-live',
    frictionless: '4200000000000091',
    challenge: '4200000000000042',
    failed: '4012001037461114',
  },
};

/** MoneyHash 3DS simulator cards. Challenge OTP is 1234. */
export const threeDsSimulatorCards = [
  { number: '2303779999000275', label: 'Frictionless, approved' },
  { number: '2303779999000291', label: 'Frictionless, declined' },
  { number: '2303779999000408', label: 'Challenge (OTP 1234), approved' },
  { number: '2303779999000424', label: 'Challenge, declined' },
];
