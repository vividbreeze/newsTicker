import SwiftUI

/// Flagge als Vektorgrafik (Emoji-Flaggen werden nicht überall zuverlässig gerendert).
/// Fällt auf das Länderkürzel zurück, wenn zu einem Code keine Grafik existiert.
struct FlagView: View {
    let code: String
    var height: CGFloat = 16

    var body: some View {
        if UIImage(named: "flag-\(code)") != nil {
            Image("flag-\(code)")
                .resizable().scaledToFit()
                .frame(height: height)
                .clipShape(RoundedRectangle(cornerRadius: 2))
                .overlay(RoundedRectangle(cornerRadius: 2).stroke(Color.primary.opacity(0.2), lineWidth: 0.5))
                .frame(width: height * 1.9, alignment: .leading) // gleiche Breite für saubere Ausrichtung
                .accessibilityHidden(true)
        } else {
            Text(code.uppercased()).font(.caption2.weight(.bold)).accessibilityHidden(true)
        }
    }
}
