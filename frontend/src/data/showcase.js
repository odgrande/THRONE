// Businesses shown in the "Businesses we've helped" logo wall.
//
// EXAMPLE DATA: these brands are invented placeholders for design preview.
// While isExample is true the page labels them "Example brands". Replace them
// with real advertisers ONLY with each business's written permission to show
// their name and logo (showing a brand as a client without consent is
// misleading advertising and can infringe their trademark), then set
// isExample to false.
//
// A logo is either { src: '/logos/acme.svg' } (put files in frontend/public/logos)
// or a generated Bauhaus mark: { mark: { shapes: ['circle','square'], colors: ['red','blue'] } }.
export const SHOWCASE = {
  isExample: true,
  brands: [
    { name: 'Kemi Fabrics', category: 'Fashion', mark: { shapes: ['circle', 'square'], colors: ['red', 'yellow'] } },
    { name: 'Lagos Bytes', category: 'Tech', mark: { shapes: ['square', 'triangle'], colors: ['blue', 'yellow'] } },
    { name: 'Mama Put Express', category: 'Food', mark: { shapes: ['circle'], colors: ['yellow'] } },
    { name: 'Northwind Bikes', category: 'Sport', mark: { shapes: ['triangle', 'circle'], colors: ['red', 'blue'] } },
    { name: 'Okafor Studio', category: 'Design', mark: { shapes: ['square'], colors: ['blue'] } },
    { name: 'Pixel Pepper', category: 'Gaming', mark: { shapes: ['circle', 'triangle'], colors: ['blue', 'red'] } },
    { name: 'Sabi Tutors', category: 'Education', mark: { shapes: ['triangle'], colors: ['yellow'] } },
    { name: 'Green Kola', category: 'Drinks', mark: { shapes: ['circle', 'circle'], colors: ['red', 'blue'] } },
    { name: 'Harmattan Beats', category: 'Music', mark: { shapes: ['square', 'circle'], colors: ['yellow', 'red'] } },
    { name: 'Ade & Co Realty', category: 'Property', mark: { shapes: ['square', 'square'], colors: ['red', 'blue'] } },
  ],
};
