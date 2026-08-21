export function getTripCopyDefaults(card: {
    title: string
    destination: string | null
}) {
    const destinationName = card.destination?.trim() || null
    return {
        title: `${destinationName ?? card.title.trim()} 여행`,
        destinationName,
    }
}
