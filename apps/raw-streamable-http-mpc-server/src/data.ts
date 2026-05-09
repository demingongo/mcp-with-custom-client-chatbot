export interface Book {
    id: string;
    title: string;
    author: string;
    year: number;
    genre: string;
    description: string;
    available: boolean;
}

export const BOOKS: Book[] = [
    {
        id: 'book-001',
        title: 'Dune',
        author: 'Frank Herbert',
        year: 1965,
        genre: 'Science Fiction',
        description:
            'A sweeping epic set on the desert planet Arrakis, following the rise of Paul Atreides amid interstellar political intrigue and ecological struggle.',
        available: true,
    },
    {
        id: 'book-002',
        title: 'Neuromancer',
        author: 'William Gibson',
        year: 1984,
        genre: 'Science Fiction',
        description:
            'A pioneering cyberpunk novel following a washed-up hacker hired for one last job in a sprawling, neon-lit future.',
        available: false,
    },
    {
        id: 'book-003',
        title: 'Nineteen Eighty-Four',
        author: 'George Orwell',
        year: 1949,
        genre: 'Dystopian',
        description:
            'A chilling portrait of a totalitarian society ruled by Big Brother, seen through the eyes of Winston Smith as he seeks truth and freedom.',
        available: true,
    },
    {
        id: 'book-004',
        title: 'Brave New World',
        author: 'Aldous Huxley',
        year: 1932,
        genre: 'Dystopian',
        description:
            'A vision of a future world-state where citizens are conditioned from birth and happiness is enforced at the cost of freedom and individuality.',
        available: true,
    },
    {
        id: 'book-005',
        title: 'The God of Small Things',
        author: 'Arundhati Roy',
        year: 1997,
        genre: 'Literary Fiction',
        description:
            'A lyrical story of forbidden love and its consequences in a small Kerala town, told across two timelines through the eyes of twins.',
        available: false,
    },
    {
        id: 'book-006',
        title: 'Never Let Me Go',
        author: 'Kazuo Ishiguro',
        year: 2005,
        genre: 'Literary Fiction',
        description:
            'A quiet and devastating novel about three friends who grew up at a seemingly idyllic English boarding school, gradually uncovering the truth of their existence.',
        available: true,
    },
];
