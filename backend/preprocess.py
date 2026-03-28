import nltk
from nltk.corpus import stopwords
from nltk.stem import PorterStemmer
from nltk.tokenize import word_tokenize
import re

nltk.download("stopwords")
nltk.download("punkt")

stopword_set = set(stopwords.words("english"))
stemmer = PorterStemmer()


def preprocess(text):

    if not isinstance(text, str):
        return ""

    text = text.lower()

    text = re.sub(r"[^a-zA-Z]", " ", text)

    tokens = word_tokenize(text)

    tokens = [t for t in tokens if t not in stopword_set]

    tokens = [t for t in tokens if len(t) > 2]

    tokens = [stemmer.stem(t) for t in tokens]

    return " ".join(tokens)