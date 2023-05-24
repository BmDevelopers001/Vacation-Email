function getRandomInterval(min, max) {
    return (Math.floor(Math.random() * (max - min + 1)) + min)*1000;
}

console.log(getRandomInterval(45, 120));