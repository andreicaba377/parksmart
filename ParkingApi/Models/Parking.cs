using System;

namespace ParkingApi.Models
{
    public class Parking
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public int TotalSpots { get; set; }
        public int AvailableSpots { get; set; }
        public double PricePerHour { get; set; }
        public DateTime? ReservationTime { get; set; }
    }
}