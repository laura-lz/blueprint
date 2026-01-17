import './globals.css';

export const metadata = {
    title: 'Codebase Visualizer',
    description: 'Visualize your codebase structure and dependencies',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
                {children}
            </body>
        </html>
    );
}
