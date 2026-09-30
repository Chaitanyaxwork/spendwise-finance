import re

_EXPENSE = {
    "Food & Dining": [
        "restaurant", "cafe", "coffee", "starbucks", "mcdonald", "kfc", "pizza", "burger",
        "domino", "swiggy", "zomato", "dining", "bakery", "dinner", "lunch", "breakfast",
        "takeout", "takeaway", "subway",
    ],
    "Groceries": [
        "grocery", "groceries", "supermarket", "walmart", "costco", "aldi", "tesco", "kroger",
        "bigbasket", "blinkit", "zepto", "dmart", "vegetables", "fruits",
    ],
    "Transport": [
        "uber", "lyft", "ola", "rapido", "taxi", "cab", "metro", "bus", "train", "fuel",
        "petrol", "diesel", "gas station", "parking", "toll",
    ],
    "Entertainment": [
        "netflix", "spotify", "hotstar", "disney", "cinema", "movie", "theatre", "theater",
        "concert", "steam", "playstation", "xbox", "youtube premium", "prime video",
    ],
    "Shopping": [
        "amazon", "flipkart", "myntra", "mall", "clothing", "clothes", "shoes", "ebay",
        "target", "ikea",
    ],
    "Utilities": [
        "electricity", "water bill", "gas bill", "internet", "broadband", "wifi", "phone bill",
        "mobile recharge", "recharge", "airtel", "jio", "vodafone", "utility", "utilities",
    ],
    "Rent & Housing": ["rent", "mortgage", "landlord", "maintenance", "hoa"],
    "Health": [
        "pharmacy", "hospital", "doctor", "clinic", "dental", "dentist", "medical", "medicine",
        "apollo", "gym", "fitness",
    ],
    "Education": ["tuition", "school", "college", "course", "udemy", "coursera", "textbook", "university"],
    "Travel": [
        "flight", "airline", "hotel", "airbnb", "booking.com", "makemytrip", "irctc",
        "vacation", "resort",
    ],
    "Insurance": ["insurance", "premium", "lic"],
    "Fees & Taxes": ["tax", "bank fee", "atm fee", "service charge", "late fee"],
}

_INCOME = {
    "Salary": ["salary", "payroll", "paycheck", "wages", "direct deposit"],
    "Bonus": ["bonus"],
    "Freelance": ["freelance", "invoice", "client payment", "consulting"],
    "Investment": ["dividend", "interest", "capital gain", "mutual fund", "stock"],
    "Refund": ["refund", "cashback", "reimbursement"],
    "Gift": ["gift"],
}


def _compile(rules):
    compiled = []
    for category, words in rules.items():
        alts = "|".join(re.escape(w) for w in words)
        compiled.append((category, re.compile(rf"\b(?:{alts})(?:s|es)?\b", re.IGNORECASE)))
    return compiled


_RULES = {"expense": _compile(_EXPENSE), "income": _compile(_INCOME)}


def categorize(description, tx_type):
    if not description:
        return None
    for category, pattern in _RULES.get(tx_type, []):
        if pattern.search(description):
            return category
    return None
